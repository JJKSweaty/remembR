#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <ctype.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/ledc.h"
#include "driver/uart.h"
#include "esp_log.h"
#include "esp_err.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "nvs_flash.h"
#include "esp_http_server.h"

static const char *TAG = "pan_tilt";

/* =========================================================
   USER SETTINGS (edit these to match your servo ranges)
   ========================================================= */
#define WIFI_SSID "Spruce309"
#define WIFI_PASS "SpruceSt.309"

// GPIO pins
#define PAN_GPIO   4
#define TILT_GPIO  7

// Servo PWM configuration
#define SERVO_FREQ_HZ     50
#define SERVO_DUTY_BITS   14
#define SERVO_DUTY_RES    LEDC_TIMER_14_BIT

// Safety limits for pulse width (microseconds)
#define SERVO_ABS_MIN_US  200
#define SERVO_ABS_MAX_US  2520

// DS3230 Pro specs: 1520μs center, 180° mode = 520-2520μs range
// Pan servo range (full 180°)
#define PAN_MIN_US   520    // 0° (full left)
#define PAN_MAX_US   2520   // 180° (full right)
#define PAN_CENTER   1520   // 90° (center)

// Tilt servo range - tilts down from horizontal, slight up
#define TILT_MIN_US  200    // Full down (~90° down from center)
#define TILT_MAX_US  1700   // Slightly above horizontal
#define TILT_CENTER  1520   // Horizontal

// Sweep speed settings
// DS3230 at 5V: 0.2 sec/60° = 200ms/60° = 3.3ms per degree
// 1° ≈ 11μs (2000μs range / 180°)
// 5° ≈ 55μs, takes ~17ms to physically move
#define PAN_STEP_US      55     // ~5 degree pan increments
#define TILT_STEP_US     55     // ~5 degree tilt increments  
#define PAN_DELAY_MS     300    // Slow pan - wait after each step
#define TILT_DELAY_MS    25     // Allow servo to reach position (~5° move time)

// HTTP Server settings
#define HTTP_SERVER_PORT  8080

// UART (USB serial)
#define UART_PORT    UART_NUM_0
#define UART_BAUD    115200
#define UART_RX_BUF  1024

/* =========================================================
   Forward Declarations
   ========================================================= */

static httpd_handle_t start_http_server(void);

/* =========================================================
   WiFi Event Handler
   ========================================================= */

static void wifi_event_handler(void* arg, esp_event_base_t event_base,
                                int32_t event_id, void* event_data)
{
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        // ESP_LOGI(TAG, "Disconnected from WiFi, retrying...");
        esp_wifi_connect();
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t* event = (ip_event_got_ip_t*) event_data;
        ESP_LOGI(TAG, "========================================");
        ESP_LOGI(TAG, "WiFi Connected! IP Address: " IPSTR, IP2STR(&event->ip_info.ip));
        ESP_LOGI(TAG, "HTTP Server listening on port %d", HTTP_SERVER_PORT);
        ESP_LOGI(TAG, "========================================");
        ESP_LOGI(TAG, "Endpoints:");
        ESP_LOGI(TAG, "  POST http://" IPSTR ":%d/sweep", IP2STR(&event->ip_info.ip), HTTP_SERVER_PORT);
        ESP_LOGI(TAG, "  POST http://" IPSTR ":%d/center", IP2STR(&event->ip_info.ip), HTTP_SERVER_PORT);
        ESP_LOGI(TAG, "========================================");
        
        // Start HTTP server
        start_http_server();
    }
}

static void wifi_init_sta(void)
{
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    esp_event_handler_instance_t instance_any_id;
    esp_event_handler_instance_t instance_got_ip;
    ESP_ERROR_CHECK(esp_event_handler_instance_register(WIFI_EVENT,
                                                        ESP_EVENT_ANY_ID,
                                                        &wifi_event_handler,
                                                        NULL,
                                                        &instance_any_id));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(IP_EVENT,
                                                        IP_EVENT_STA_GOT_IP,
                                                        &wifi_event_handler,
                                                        NULL,
                                                        &instance_got_ip));

    wifi_config_t wifi_config = {
        .sta = {
            .ssid = WIFI_SSID,
            .password = WIFI_PASS,
            .threshold.authmode = WIFI_AUTH_WPA2_PSK,
        },
    };
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());

    ESP_LOGI(TAG, "WiFi initialization complete. Connecting to %s...", WIFI_SSID);
}

/* =========================================================
   Servo Control Functions
   ========================================================= */

static inline int clamp_int(int v, int lo, int hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
}

static uint32_t pulse_us_to_duty(int pulse_us) {
    const int period_us = 1000000 / SERVO_FREQ_HZ; // 20000us at 50Hz
    pulse_us = clamp_int(pulse_us, 0, period_us);

    const uint32_t max_duty = (1u << SERVO_DUTY_BITS) - 1; // 14-bit -> 16383
    return (uint32_t)((uint64_t)pulse_us * max_duty / period_us);
}

static void ledc_servo_init(void) {
    ledc_timer_config_t timer = {
        .speed_mode       = LEDC_LOW_SPEED_MODE,
        .duty_resolution  = SERVO_DUTY_RES,
        .timer_num        = LEDC_TIMER_0,
        .freq_hz          = SERVO_FREQ_HZ,
        .clk_cfg          = LEDC_AUTO_CLK
    };
    ESP_ERROR_CHECK(ledc_timer_config(&timer));

    ledc_channel_config_t ch_pan = {
        .gpio_num   = PAN_GPIO,
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .channel    = LEDC_CHANNEL_0,
        .intr_type  = LEDC_INTR_DISABLE,
        .timer_sel  = LEDC_TIMER_0,
        .duty       = 0,
        .hpoint     = 0
    };
    ESP_ERROR_CHECK(ledc_channel_config(&ch_pan));

    ledc_channel_config_t ch_tilt = {
        .gpio_num   = TILT_GPIO,
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .channel    = LEDC_CHANNEL_1,
        .intr_type  = LEDC_INTR_DISABLE,
        .timer_sel  = LEDC_TIMER_0,
        .duty       = 0,
        .hpoint     = 0
    };
    ESP_ERROR_CHECK(ledc_channel_config(&ch_tilt));

    ESP_LOGI(TAG, "LEDC init: PAN GPIO%d (CH0), TILT GPIO%d (CH1)", PAN_GPIO, TILT_GPIO);
}

static void servo_write_us(ledc_channel_t ch, int pulse_us) {
    pulse_us = clamp_int(pulse_us, SERVO_ABS_MIN_US, SERVO_ABS_MAX_US);

    uint32_t duty = pulse_us_to_duty(pulse_us);
    ESP_ERROR_CHECK(ledc_set_duty(LEDC_LOW_SPEED_MODE, ch, duty));
    ESP_ERROR_CHECK(ledc_update_duty(LEDC_LOW_SPEED_MODE, ch));
}

static void set_pan_us(int us) {
    servo_write_us(LEDC_CHANNEL_0, us);
}

static void set_tilt_us(int us) {
    servo_write_us(LEDC_CHANNEL_1, us);
}

static void center_both(void) {
    int pan_center = (PAN_MIN_US + PAN_MAX_US) / 2;
    int tilt_center = (TILT_MIN_US + TILT_MAX_US) / 2;
    
    set_pan_us(pan_center);
    set_tilt_us(tilt_center);    
    ESP_LOGI(TAG, "Centered: PAN=%d us, TILT=%d us", pan_center, tilt_center);
}

/* =========================================================
   Sweep Function: Simple left-to-right scan with tilt at each position
   ========================================================= */

static volatile bool sweep_in_progress = false;

static void do_sweep(void) {
    // Prevent multiple simultaneous sweeps
    if (sweep_in_progress) {
        ESP_LOGW(TAG, "Sweep already in progress, ignoring request");
        return;
    }
    sweep_in_progress = true;
    
    ESP_LOGI(TAG, "===========================================");
    ESP_LOGI(TAG, "SWEEP START");
    ESP_LOGI(TAG, "===========================================");
    
    // Move to starting position: far left, tilt up
    set_pan_us(PAN_MIN_US);
    set_tilt_us(TILT_MAX_US);
    ESP_LOGI(TAG, "At start position: PAN=%d, TILT=%d", PAN_MIN_US, TILT_MAX_US);
    vTaskDelay(pdMS_TO_TICKS(1000));  // Wait 1 second at start
    
    // Calculate number of pan steps
    int num_pan_steps = (PAN_MAX_US - PAN_MIN_US) / PAN_STEP_US;
    ESP_LOGI(TAG, "Will do %d pan steps", num_pan_steps);
    
    // Main sweep loop - go from left to right
    int current_pan = PAN_MIN_US;
    int step = 0;
    
    while (current_pan <= PAN_MAX_US) {
        step++;
        ESP_LOGI(TAG, "Step %d/%d - Pan at %d us", step, num_pan_steps, current_pan);
        
        // Set pan position
        set_pan_us(current_pan);
        vTaskDelay(pdMS_TO_TICKS(100));  // Let pan settle
        
        // Tilt down
        ESP_LOGI(TAG, "  Tilting down...");
        int tilt = TILT_MAX_US;
        while (tilt >= TILT_MIN_US) {
            set_tilt_us(tilt);
            vTaskDelay(pdMS_TO_TICKS(TILT_DELAY_MS));
            tilt = tilt - TILT_STEP_US;
        }
        
        // Tilt back up
        ESP_LOGI(TAG, "  Tilting up...");
        tilt = TILT_MIN_US;
        while (tilt <= TILT_MAX_US) {
            set_tilt_us(tilt);
            vTaskDelay(pdMS_TO_TICKS(TILT_DELAY_MS));
            tilt = tilt + TILT_STEP_US;
        }
        
        // Wait before moving to next pan position
        vTaskDelay(pdMS_TO_TICKS(PAN_DELAY_MS));
        
        // Advance pan position
        current_pan = current_pan + PAN_STEP_US;
    }
    
    // Done - return to center
    ESP_LOGI(TAG, "Returning to center...");
    set_pan_us(PAN_CENTER);
    set_tilt_us(TILT_CENTER);
    vTaskDelay(pdMS_TO_TICKS(500));
    
    ESP_LOGI(TAG, "===========================================");
    ESP_LOGI(TAG, "SWEEP COMPLETE!");
    ESP_LOGI(TAG, "===========================================");
    
    sweep_in_progress = false;
}

/* =========================================================
   Range Testing Functions
   ========================================================= */

static void test_pan_range(void) {
    ESP_LOGI(TAG, "Testing PAN range: %d to %d us", PAN_MIN_US, PAN_MAX_US);
    
    // Go to min
    set_pan_us(PAN_MIN_US);
    ESP_LOGI(TAG, "PAN at MIN (%d us) - Check position", PAN_MIN_US);
    vTaskDelay(pdMS_TO_TICKS(2000));
    
    // Go to max
    set_pan_us(PAN_MAX_US);
    ESP_LOGI(TAG, "PAN at MAX (%d us) - Check position", PAN_MAX_US);
    vTaskDelay(pdMS_TO_TICKS(2000));
    
    // Return to center
    set_pan_us((PAN_MIN_US + PAN_MAX_US) / 2);
    ESP_LOGI(TAG, "PAN returned to CENTER");
}

static void test_tilt_range(void) {
    ESP_LOGI(TAG, "Testing TILT range: %d to %d us", TILT_MIN_US, TILT_MAX_US);
    
    // Go to min
    set_tilt_us(TILT_MIN_US);
    ESP_LOGI(TAG, "TILT at MIN (%d us) - Check position", TILT_MIN_US);
    vTaskDelay(pdMS_TO_TICKS(2000));
    
    // Go to max
    set_tilt_us(TILT_MAX_US);
    ESP_LOGI(TAG, "TILT at MAX (%d us) - Check position", TILT_MAX_US);
    vTaskDelay(pdMS_TO_TICKS(2000));
    
    // Return to center
    set_tilt_us((TILT_MIN_US + TILT_MAX_US) / 2);
    ESP_LOGI(TAG, "TILT returned to CENTER");
}

/* =========================================================
   UART Command Handling
   ========================================================= */

static void uart_send_line(const char *s) {
    uart_write_bytes(UART_PORT, s, strlen(s));
    uart_write_bytes(UART_PORT, "\r\n", 2);
}

static void print_help(void) {
    uart_send_line("===== Pan/Tilt Control Commands =====");
    uart_send_line("  PANUS:<value>     - Set pan position (e.g., PANUS:1500)");
    uart_send_line("  TILTUS:<value>    - Set tilt position (e.g., TILTUS:1500)");
    uart_send_line("  CENTER            - Move both servos to center");
    uart_send_line("  TESTPAN           - Test pan servo range");
    uart_send_line("  TESTTILT          - Test tilt servo range");
    uart_send_line("  SWEEP             - Execute pan/tilt sweep pattern");
    uart_send_line("  HELP              - Show this help");
    uart_send_line("");
    uart_send_line("Current ranges:");
    char buf[64];
    snprintf(buf, sizeof(buf), "  PAN:  %d-%d us", PAN_MIN_US, PAN_MAX_US);
    uart_send_line(buf);
    snprintf(buf, sizeof(buf), "  TILT: %d-%d us", TILT_MIN_US, TILT_MAX_US);
    uart_send_line(buf);
}

static void handle_command(char *line) {
    // Trim whitespace
    while (*line && isspace((unsigned char)*line)) line++;
    size_t n = strlen(line);
    while (n > 0 && isspace((unsigned char)line[n - 1])) line[--n] = '\0';
    if (n == 0) return;

    if (strncmp(line, "PANUS:", 6) == 0) {
        int us = atoi(line + 6);
        set_pan_us(us);
        char buf[32];
        snprintf(buf, sizeof(buf), "OK: PAN=%d us", us);
        uart_send_line(buf);

    } else if (strncmp(line, "TILTUS:", 7) == 0) {
        int us = atoi(line + 7);
        set_tilt_us(us);
        char buf[32];
        snprintf(buf, sizeof(buf), "OK: TILT=%d us", us);
        uart_send_line(buf);

    } else if (strcmp(line, "CENTER") == 0) {
        center_both();
        uart_send_line("OK: Centered");

    } else if (strcmp(line, "TESTPAN") == 0) {
        test_pan_range();
        uart_send_line("OK: Pan test complete");

    } else if (strcmp(line, "TESTTILT") == 0) {
        test_tilt_range();
        uart_send_line("OK: Tilt test complete");

    } else if (strcmp(line, "SWEEP") == 0) {
        uart_send_line("Starting sweep...");
        do_sweep();
        uart_send_line("OK: Sweep complete");

    } else if (strcmp(line, "HELP") == 0) {
        print_help();

    } else {
        uart_send_line("ERROR: Unknown command. Type HELP for commands.");
    }
}

static void uart_task(void *arg) {
    uint8_t *rx = (uint8_t *)malloc(UART_RX_BUF);
    if (!rx) vTaskDelete(NULL);

    char line[128];
    int line_len = 0;

    while (1) {
        int len = uart_read_bytes(UART_PORT, rx, UART_RX_BUF, pdMS_TO_TICKS(100));
        for (int i = 0; i < len; i++) {
            char c = (char)rx[i];

            if (c == '\r' || c == '\n') {
                if (line_len > 0) {
                    line[line_len] = '\0';
                    handle_command(line);
                    line_len = 0;
                }
            } else {
                if (line_len < (int)sizeof(line) - 1) {
                    line[line_len++] = c;
                }
            }
        }
    }
}

/* =========================================================
   HTTP Server Handlers
   ========================================================= */

static httpd_handle_t server = NULL;

// CORS headers for browser requests
static esp_err_t set_cors_headers(httpd_req_t *req) {
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Headers", "Content-Type");
    return ESP_OK;
}

// OPTIONS handler for CORS preflight
static esp_err_t options_handler(httpd_req_t *req) {
    set_cors_headers(req);
    httpd_resp_send(req, NULL, 0);
    return ESP_OK;
}

// POST /sweep - Execute sweep pattern
static esp_err_t sweep_handler(httpd_req_t *req) {
    set_cors_headers(req);
    
    ESP_LOGI(TAG, "HTTP: Sweep command received");
    do_sweep();
    
    httpd_resp_set_type(req, "text/plain");
    httpd_resp_send(req, "OK", 2);
    return ESP_OK;
}

// POST /center - Center both servos
static esp_err_t center_handler(httpd_req_t *req) {
    set_cors_headers(req);
    
    ESP_LOGI(TAG, "HTTP: Center command received");
    center_both();
    
    httpd_resp_set_type(req, "text/plain");
    httpd_resp_send(req, "OK", 2);
    return ESP_OK;
}

// POST /pan?us=<value> - Set pan position
static esp_err_t pan_handler(httpd_req_t *req) {
    set_cors_headers(req);
    
    char query[64];
    if (httpd_req_get_url_query_str(req, query, sizeof(query)) == ESP_OK) {
        char param[16];
        if (httpd_query_key_value(query, "us", param, sizeof(param)) == ESP_OK) {
            int us = atoi(param);
            ESP_LOGI(TAG, "HTTP: Pan=%d us", us);
            set_pan_us(us);
            httpd_resp_set_type(req, "text/plain");
            httpd_resp_send(req, "OK", 2);
            return ESP_OK;
        }
    }
    
    httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Missing 'us' parameter");
    return ESP_FAIL;
}

// POST /tilt?us=<value> - Set tilt position
static esp_err_t tilt_handler(httpd_req_t *req) {
    set_cors_headers(req);
    
    char query[64];
    if (httpd_req_get_url_query_str(req, query, sizeof(query)) == ESP_OK) {
        char param[16];
        if (httpd_query_key_value(query, "us", param, sizeof(param)) == ESP_OK) {
            int us = atoi(param);
            ESP_LOGI(TAG, "HTTP: Tilt=%d us", us);
            set_tilt_us(us);
            httpd_resp_set_type(req, "text/plain");
            httpd_resp_send(req, "OK", 2);
            return ESP_OK;
        }
    }
    
    httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Missing 'us' parameter");
    return ESP_FAIL;
}

// GET /status - Get device status
static esp_err_t status_handler(httpd_req_t *req) {
    set_cors_headers(req);
    
    char response[128];
    snprintf(response, sizeof(response), 
             "{\"status\":\"ready\",\"pan_range\":[%d,%d],\"tilt_range\":[%d,%d]}",
             PAN_MIN_US, PAN_MAX_US, TILT_MIN_US, TILT_MAX_US);
    
    httpd_resp_set_type(req, "application/json");
    httpd_resp_send(req, response, strlen(response));
    return ESP_OK;
}

static httpd_handle_t start_http_server(void) {
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.server_port = HTTP_SERVER_PORT;
    config.lru_purge_enable = true;

    ESP_LOGI(TAG, "Starting HTTP server on port %d", config.server_port);
    
    if (httpd_start(&server, &config) == ESP_OK) {
        // Register URI handlers
        httpd_uri_t sweep_uri = {
            .uri       = "/sweep",
            .method    = HTTP_POST,
            .handler   = sweep_handler,
            .user_ctx  = NULL
        };
        httpd_register_uri_handler(server, &sweep_uri);
        
        httpd_uri_t sweep_options = {
            .uri       = "/sweep",
            .method    = HTTP_OPTIONS,
            .handler   = options_handler,
            .user_ctx  = NULL
        };
        httpd_register_uri_handler(server, &sweep_options);
        
        httpd_uri_t center_uri = {
            .uri       = "/center",
            .method    = HTTP_POST,
            .handler   = center_handler,
            .user_ctx  = NULL
        };
        httpd_register_uri_handler(server, &center_uri);
        
        httpd_uri_t center_options = {
            .uri       = "/center",
            .method    = HTTP_OPTIONS,
            .handler   = options_handler,
            .user_ctx  = NULL
        };
        httpd_register_uri_handler(server, &center_options);
        
        httpd_uri_t pan_uri = {
            .uri       = "/pan",
            .method    = HTTP_POST,
            .handler   = pan_handler,
            .user_ctx  = NULL
        };
        httpd_register_uri_handler(server, &pan_uri);
        
        httpd_uri_t tilt_uri = {
            .uri       = "/tilt",
            .method    = HTTP_POST,
            .handler   = tilt_handler,
            .user_ctx  = NULL
        };
        httpd_register_uri_handler(server, &tilt_uri);
        
        httpd_uri_t status_uri = {
            .uri       = "/status",
            .method    = HTTP_GET,
            .handler   = status_handler,
            .user_ctx  = NULL
        };
        httpd_register_uri_handler(server, &status_uri);
        
        return server;
    }

    ESP_LOGI(TAG, "Error starting HTTP server");
    return NULL;
}

void app_main(void) {
    ESP_LOGI(TAG, "========================================");
    ESP_LOGI(TAG, "Starting Pan/Tilt Servo Controller");
    ESP_LOGI(TAG, "========================================");

    // Initialize NVS (required for WiFi)
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    // Initialize WiFi
    wifi_init_sta();

    // Initialize UART
    uart_config_t uart_cfg = {
        .baud_rate = UART_BAUD,
        .data_bits = UART_DATA_8_BITS,
        .parity    = UART_PARITY_DISABLE,
        .stop_bits = UART_STOP_BITS_1,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE
    };
    ESP_ERROR_CHECK(uart_driver_install(UART_PORT, UART_RX_BUF * 2, 0, 0, NULL, 0));
    ESP_ERROR_CHECK(uart_param_config(UART_PORT, &uart_cfg));

    // Initialize servos
    ledc_servo_init();

    // Center both servos at startup
    vTaskDelay(pdMS_TO_TICKS(100));
    center_both();
    vTaskDelay(pdMS_TO_TICKS(300));

    // Send welcome message
    uart_send_line("");
    uart_send_line("========================================");
    uart_send_line("Pan/Tilt Controller Ready!");
    uart_send_line("========================================");
    uart_send_line("Type HELP to see available commands");
    uart_send_line("");

    // Start UART command task
    xTaskCreate(uart_task, "uart_task", 4096, NULL, 5, NULL);

    // HTTP server will start automatically when WiFi connects

    // Main loop (idle)
    while (1) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}
