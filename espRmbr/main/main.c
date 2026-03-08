#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <ctype.h>

// FreeRTOS: the operating system running on the ESP32
// It lets you run multiple tasks at the same time (like handling WiFi AND listening for UART commands)
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

// LEDC = LED Control peripheral — despite the name, it's used here to generate PWM signals for the servos
#include "driver/ledc.h"

// UART = Serial communication (USB cable to your computer, used for typing commands)
#include "driver/uart.h"

// Logging: lets you print messages like ESP_LOGI(TAG, "Hello") to the serial monitor
#include "esp_log.h"
#include "esp_err.h"

// WiFi libraries — needed to connect to your home network
#include "esp_wifi.h"
#include "esp_event.h"
#include "nvs_flash.h"

// HTTP server — lets the ESP32 receive commands from a browser or app over WiFi
#include "esp_http_server.h"

// TAG is just a label that appears in all your log messages so you know they came from this file
static const char *TAG = "pan_tilt";

/* =========================================================
   SETTINGS — CHANGE THESE IF THINGS AREN'T WORKING RIGHT
   
   This is the first place to look when debugging.
   WiFi not connecting? Check SSID and password.
   Servo moving wrong? Adjust the MIN/MAX/CENTER values.
   ========================================================= */

// --- WiFi credentials ---
// Change these to match your network name and password
#define WIFI_SSID "Spruce309"
#define WIFI_PASS "SpruceSt.309"

// --- Which GPIO pins the servos are wired to ---
// If your servo doesn't move, double-check these match your wiring
#define PAN_GPIO   4   // Pan servo signal wire goes to GPIO 4
#define TILT_GPIO  7   // Tilt servo signal wire goes to GPIO 7

// --- PWM settings for the servo signal ---
// Servos expect a 50Hz signal (one pulse every 20ms). Don't change these unless you know what you're doing.
#define SERVO_FREQ_HZ     50
#define SERVO_DUTY_BITS   14
#define SERVO_DUTY_RES    LEDC_TIMER_14_BIT

// --- Hard safety limits (in microseconds) ---
// The code will never send a pulse outside this range, no matter what.
// This prevents physically damaging the servos by pushing past their limits.
#define SERVO_ABS_MIN_US  300
#define SERVO_ABS_MAX_US  2000

// --- Pan servo range (left/right rotation) ---
// These values control how far left and right the pan servo moves.
// 520 = full left (0°), 2520 = full right (180°), 1520 = center (90°)
// If the servo hits the physical end-stop before reaching these values, reduce MIN or MAX.
#define PAN_MIN_US   630    // Full left position
#define PAN_MAX_US   1680   // Full right position
#define PAN_CENTER   1155   // Center / straight ahead

// --- Tilt servo range (up/down rotation) ---
// These values control how far up and down the tilt servo moves.
// If the camera tilts too far and the wires get strained, increase TILT_MIN_US.
#define TILT_MIN_US  400    // Fully tilted down
#define TILT_MAX_US  800   // Tilted up / horizontal
#define TILT_CENTER  600   // Center / horizontal

// --- Sweep speed settings ---
// These control how fast the sweep pattern moves.
// Bigger STEP = fewer positions visited (faster but less coverage)
// Bigger DELAY = slower movement (more time at each position)
#define PAN_STEP_US      110     // How many microseconds to advance pan each step (~5 degrees)
#define TILT_STEP_US     55     // How many microseconds to advance tilt each step (~5 degrees)
#define PAN_DELAY_MS     300    // How long to wait at each pan position before moving on (ms)
#define TILT_DELAY_MS    100     // How long to wait between each tilt step (ms)

// --- HTTP server port ---
// The ESP32 will listen for commands at http://<IP>:8080/
// For example: http://192.168.1.50:8080/sweep
#define HTTP_SERVER_PORT  8080

// --- UART (USB serial) settings ---
// Used when you type commands directly into a serial monitor (like in VS Code or Arduino IDE)
#define UART_PORT    UART_NUM_0
#define UART_BAUD    115200
#define UART_RX_BUF  1024

/* =========================================================
   Forward Declarations
   Just telling the compiler "these functions exist further down in the file"
   ========================================================= */
static httpd_handle_t start_http_server(void);
static void uart_send_line(const char *s);

/* =========================================================
   STOP / PAUSE / RESUME FLAGS + SWEEP TASK HANDLE
   
   stop_requested  — STOP command: aborts sweep and returns to center.
   pause_requested — PAUSE command: freezes servos exactly where they are.
                     The sweep loop waits in place until RESUME is sent.
                     Servos stay powered and hold their position during pause.
   sweep_task_handle — NULL means no sweep is running.
   ========================================================= */
static volatile bool stop_requested    = false;  // Set by STOP  — aborts sweep, goes to center
static volatile bool pause_requested   = false;  // Set by PAUSE — freezes in place until RESUME
static TaskHandle_t  sweep_task_handle = NULL;   // NULL = no sweep running

/* =========================================================
   WIFI EVENT HANDLER
   
   This function runs automatically whenever something happens with WiFi:
   - When WiFi starts → try to connect
   - If disconnected → automatically reconnect
   - When we get an IP address → print it and start the HTTP server
   
   You don't call this manually — the ESP32 event system calls it for you.
   ========================================================= */
static void wifi_event_handler(void* arg, esp_event_base_t event_base,
                                int32_t event_id, void* event_data)
{
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        // WiFi driver started — now actually try to connect to the router
        esp_wifi_connect();

    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        // Lost connection — keep retrying automatically
        esp_wifi_connect();

    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        // Successfully connected and received an IP address from the router
        ip_event_got_ip_t* event = (ip_event_got_ip_t*) event_data;

        // Print the IP address to the serial monitor — you'll need this to send HTTP commands
        ESP_LOGI(TAG, "========================================");
        ESP_LOGI(TAG, "WiFi Connected! IP Address: " IPSTR, IP2STR(&event->ip_info.ip));
        ESP_LOGI(TAG, "HTTP Server listening on port %d", HTTP_SERVER_PORT);
        ESP_LOGI(TAG, "========================================");
        ESP_LOGI(TAG, "Endpoints:");
        ESP_LOGI(TAG, "  POST http://" IPSTR ":%d/sweep", IP2STR(&event->ip_info.ip), HTTP_SERVER_PORT);
        ESP_LOGI(TAG, "  POST http://" IPSTR ":%d/center", IP2STR(&event->ip_info.ip), HTTP_SERVER_PORT);
        ESP_LOGI(TAG, "========================================");

        // Now that we have WiFi, start the HTTP server so it can receive commands
        start_http_server();
    }
}

/* =========================================================
   WIFI INITIALIZATION
   
   Sets up the ESP32 as a WiFi client (STA = station mode),
   registers the event handler above, and starts the connection process.
   
   Called once at startup from app_main().
   ========================================================= */
static void wifi_init_sta(void)
{
    ESP_ERROR_CHECK(esp_netif_init());               // Initialize network interface layer
    ESP_ERROR_CHECK(esp_event_loop_create_default()); // Create the event loop (handles WiFi events)
    esp_netif_create_default_wifi_sta();              // Create a default WiFi station interface

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));             // Initialize the WiFi driver

    // Register our event handler for both WiFi and IP events
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

    // Set the WiFi network name (SSID) and password from the defines at the top
    wifi_config_t wifi_config = {
        .sta = {
            .ssid = WIFI_SSID,
            .password = WIFI_PASS,
            .threshold.authmode = WIFI_AUTH_WPA2_PSK, // Require WPA2 security
        },
    };
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));         // Station mode (connect to a router)
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());                          // Start WiFi — triggers the event handler

    ESP_LOGI(TAG, "WiFi initialization complete. Connecting to %s...", WIFI_SSID);
}

/* =========================================================
   SERVO HELPER FUNCTIONS
   
   Servos are controlled by the width of a PWM pulse:
   - Short pulse (~500µs) = one extreme position
   - Long pulse (~2500µs) = opposite extreme position
   - Middle pulse (~1500µs) = center position
   
   These helpers convert a microsecond value into the
   duty cycle number the LEDC hardware needs.
   ========================================================= */

// Clamps a value between lo and hi — prevents out-of-range positions
static inline int clamp_int(int v, int lo, int hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
}

// Converts a pulse width in microseconds to a LEDC duty count
// Example: 1500µs pulse out of 20000µs period → ~12% duty cycle
static uint32_t pulse_us_to_duty(int pulse_us) {
    const int period_us = 1000000 / SERVO_FREQ_HZ; // 20000µs at 50Hz
    pulse_us = clamp_int(pulse_us, 0, period_us);

    const uint32_t max_duty = (1u << SERVO_DUTY_BITS) - 1; // 14-bit → max value 16383
    return (uint32_t)((uint64_t)pulse_us * max_duty / period_us);
}

/* =========================================================
   SERVO HARDWARE INITIALIZATION
   
   Sets up the LEDC (PWM) timer and two output channels:
   - Channel 0 → Pan servo (GPIO 4)
   - Channel 1 → Tilt servo (GPIO 7)
   
   Called once at startup. If your servos never move at all,
   check the GPIO pin numbers at the top of this file.
   ========================================================= */
static void ledc_servo_init(void) {
    // Configure the shared timer (both servos use the same 50Hz timer)
    ledc_timer_config_t timer = {
        .speed_mode       = LEDC_LOW_SPEED_MODE,
        .duty_resolution  = SERVO_DUTY_RES,
        .timer_num        = LEDC_TIMER_0,
        .freq_hz          = SERVO_FREQ_HZ,   // 50Hz = servo standard
        .clk_cfg          = LEDC_AUTO_CLK
    };
    ESP_ERROR_CHECK(ledc_timer_config(&timer));

    // Configure Channel 0 → Pan servo output pin
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

    // Configure Channel 1 → Tilt servo output pin
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

/* =========================================================
   LOW-LEVEL SERVO WRITE FUNCTIONS
   
   These are the actual functions that move the servos.
   Everything else eventually calls one of these.
   
   servo_write_us() → raw write to either servo by channel number
   set_pan_us()     → move pan servo to a specific pulse width
   set_tilt_us()    → move tilt servo to a specific pulse width
   center_both()    → move both servos to their center/home position
   ========================================================= */

// Write a pulse width (in microseconds) to a servo channel
// The value is clamped to the absolute safety limits defined at the top
static void servo_write_us(ledc_channel_t ch, int pulse_us) {
    pulse_us = clamp_int(pulse_us, SERVO_ABS_MIN_US, SERVO_ABS_MAX_US); // Safety clamp
    uint32_t duty = pulse_us_to_duty(pulse_us);
    ESP_ERROR_CHECK(ledc_set_duty(LEDC_LOW_SPEED_MODE, ch, duty));
    ESP_ERROR_CHECK(ledc_update_duty(LEDC_LOW_SPEED_MODE, ch));
}

// Move pan servo to a specific position (in microseconds)
static void set_pan_us(int us) {
    servo_write_us(LEDC_CHANNEL_0, us);
}

// Move tilt servo to a specific position (in microseconds)
static void set_tilt_us(int us) {
    servo_write_us(LEDC_CHANNEL_1, us);
}

// Move both servos to their calculated center positions
// Center = midpoint between MIN and MAX for each servo
static void center_both(void) {
    int pan_center = (PAN_MIN_US + PAN_MAX_US) / 2;
    int tilt_center = (TILT_MIN_US + TILT_MAX_US) / 2;
    set_pan_us(pan_center);
    set_tilt_us(tilt_center);
    ESP_LOGI(TAG, "Centered: PAN=%d us, TILT=%d us", pan_center, tilt_center);
}

/* =========================================================
   PAUSE HELPER
   
   Called inside the sweep loop whenever it's about to move.
   If pause_requested is set, this function just sits in a tight
   loop checking every 100ms — servos stay exactly where they are
   because we simply stop sending new position commands.
   
   The loop exits when:
     - RESUME is sent  → pause_requested goes false → sweep continues
     - STOP is sent    → stop_requested goes true   → sweep aborts
   ========================================================= */
static void wait_if_paused(void) {
    if (!pause_requested) return; // Not paused — nothing to do

    uart_send_line("PAUSED. Send RESUME to continue or STOP to abort.");
    ESP_LOGI(TAG, "Sweep PAUSED — waiting for RESUME or STOP");

    // Sit here doing nothing until unpaused or stopped
    while (pause_requested && !stop_requested) {
        vTaskDelay(pdMS_TO_TICKS(100)); // Check every 100ms — low CPU usage
    }

    // Figure out why we woke up
    if (stop_requested) {
        ESP_LOGI(TAG, "STOP received while paused — aborting");
    } else {
        uart_send_line("RESUMED. Continuing sweep...");
        ESP_LOGI(TAG, "Sweep RESUMED");
    }
}

/* =========================================================
   SWEEP PATTERN
   
   This is the main scanning movement. Here's what it does:
   
   1. Move pan to the far LEFT and tilt UP (starting corner)
   2. Loop across the room left → right in PAN_STEP_US increments
   3. At each pan position: tilt DOWN then back UP (vertical scan)
   4. After each full tilt cycle: advance pan one step to the right
   5. When pan reaches the far RIGHT: return both servos to center
   
   Think of it like reading a page: scan top-to-bottom, 
   then move right one column, scan again.
   
   To make the sweep slower: increase PAN_DELAY_MS or TILT_DELAY_MS
   To scan fewer positions: increase PAN_STEP_US or TILT_STEP_US

   The sweep runs as its own FreeRTOS task (sweep_task) so that the
   UART stays fully responsive during the sweep. This is what makes
   STOP and PAUSE work — the UART task and sweep task run at the same time.
   ========================================================= */

// The actual sweep logic — runs inside sweep_task (its own FreeRTOS task)
static void sweep_task(void *arg) {
    ESP_LOGI(TAG, "===========================================");
    ESP_LOGI(TAG, "SWEEP START");
    ESP_LOGI(TAG, "===========================================");

    // --- Step 1: Move to starting position (far left, tilted up) ---
    set_pan_us(PAN_MIN_US);
    set_tilt_us(TILT_MAX_US);
    ESP_LOGI(TAG, "At start position: PAN=%d, TILT=%d", PAN_MIN_US, TILT_MAX_US);
    vTaskDelay(pdMS_TO_TICKS(1000)); // Wait 1 second for servo to physically reach the position

    // How many pan steps will we take across the full range?
    int num_pan_steps = (PAN_MAX_US - PAN_MIN_US) / PAN_STEP_US;
    ESP_LOGI(TAG, "Will do %d pan steps", num_pan_steps);

    // --- Step 2: Main sweep loop — pan left to right ---
    int current_pan = PAN_MIN_US;
    int step = 0;

    while (current_pan <= PAN_MAX_US) {

        // ── STOP CHECK (between pan columns) ──────────────────────────────
        // If STOP was typed in the serial monitor, bail out immediately
        if (stop_requested) {
            ESP_LOGW(TAG, "STOP requested — aborting sweep at pan=%d", current_pan);
            uart_send_line("STOPPED: returning to center...");
            break;
        }

        // ── PAUSE CHECK (between pan columns) ─────────────────────────────
        // Servos hold their current position while paused
        wait_if_paused();
        if (stop_requested) break; // STOP may have been sent while paused

        step++;
        ESP_LOGI(TAG, "Step %d/%d - Pan at %d us", step, num_pan_steps, current_pan);

        // Move pan to current column position and wait for it to settle
        set_pan_us(current_pan);
        vTaskDelay(pdMS_TO_TICKS(100));

        // --- Step 3a: Tilt DOWN (top to bottom vertical scan) ---
        ESP_LOGI(TAG, "  Tilting down...");
        int tilt = TILT_MAX_US;
        while (tilt >= TILT_MIN_US) {
            // ── STOP CHECK (during tilt down) ─────────────────────────────
            if (stop_requested) break;
            // ── PAUSE CHECK (during tilt down) ────────────────────────────
            wait_if_paused();
            if (stop_requested) break;

            set_tilt_us(tilt);
            vTaskDelay(pdMS_TO_TICKS(TILT_DELAY_MS));
            tilt -= TILT_STEP_US; // Move down by one step
        }

        // --- Step 3b: Tilt back UP (bottom to top) ---
        ESP_LOGI(TAG, "  Tilting up...");
        tilt = TILT_MIN_US;
        while (tilt <= TILT_MAX_US) {
            // ── STOP CHECK (during tilt up) ───────────────────────────────
            if (stop_requested) break;
            // ── PAUSE CHECK (during tilt up) ──────────────────────────────
            wait_if_paused();
            if (stop_requested) break;

            set_tilt_us(tilt);
            vTaskDelay(pdMS_TO_TICKS(TILT_DELAY_MS));
            tilt += TILT_STEP_US; // Move up by one step
        }

        // ── STOP CHECK (after tilt cycle, before pan delay) ───────────────
        if (stop_requested) {
            uart_send_line("STOPPED: returning to center...");
            break;
        }

        // Pause before advancing to the next pan position
        vTaskDelay(pdMS_TO_TICKS(PAN_DELAY_MS));

        // Advance pan to the next column
        current_pan += PAN_STEP_US;
    }

    // --- Step 4: Always return to center when done — whether finished or stopped ---
    // NOTE: If we were PAUSED and then STOPped, we still return to center here.
    //       If we just finished normally, we also return to center.
    //       The servos stay WHERE THEY ARE only during an active PAUSE.
    ESP_LOGI(TAG, "Returning to center...");
    center_both();
    vTaskDelay(pdMS_TO_TICKS(500));

    if (stop_requested) {
        uart_send_line("OK: Stopped. Servos returned to center.");
        ESP_LOGI(TAG, "===========================================");
        ESP_LOGI(TAG, "SWEEP STOPPED BY USER");
        ESP_LOGI(TAG, "===========================================");
    } else {
        uart_send_line("OK: Sweep complete. Servos returned to center.");
        ESP_LOGI(TAG, "===========================================");
        ESP_LOGI(TAG, "SWEEP COMPLETE!");
        ESP_LOGI(TAG, "===========================================");
    }

    // Clear the task handle so do_sweep() knows no sweep is running anymore
    sweep_task_handle = NULL;

    // FreeRTOS tasks must delete themselves when done — never just return
    vTaskDelete(NULL);
}

// Called to kick off a sweep — launches sweep_task in the background and returns immediately
// This is what keeps UART responsive so STOP/PAUSE can be received during a sweep
static void do_sweep(void) {
    // Don't start a second sweep if one is already running
    if (sweep_task_handle != NULL) {
        uart_send_line("WARNING: Sweep already running. Send STOP first.");
        return;
    }

    // Clear any leftover flags from a previous run
    stop_requested  = false;
    pause_requested = false;

    // Launch the sweep as a separate FreeRTOS task (4KB stack, priority 5)
    // xTaskCreate returns immediately — sweep runs in the background
    xTaskCreate(sweep_task, "sweep_task", 4096, NULL, 5, &sweep_task_handle);
    uart_send_line("Sweep started. Send PAUSE to freeze, STOP to abort.");
}

/* =========================================================
   RANGE TESTING FUNCTIONS
   
   Use these when you're first setting up your servos, or
   after changing the MIN/MAX values above.
   
   test_pan_range()  — moves pan to MIN, MAX, then center so you can 
                       see the physical limits and adjust if needed
   test_tilt_range() — same thing for tilt
   
   Trigger via serial: type TESTPAN or TESTTILT
   ========================================================= */
static void test_pan_range(void) {
    ESP_LOGI(TAG, "Testing PAN range: %d to %d us", PAN_MIN_US, PAN_MAX_US);
    set_pan_us(PAN_MIN_US);
    ESP_LOGI(TAG, "PAN at MIN (%d us) - Check position", PAN_MIN_US);
    vTaskDelay(pdMS_TO_TICKS(2000)); // Hold for 2 seconds so you can observe

    set_pan_us(PAN_MAX_US);
    ESP_LOGI(TAG, "PAN at MAX (%d us) - Check position", PAN_MAX_US);
    vTaskDelay(pdMS_TO_TICKS(2000));

    set_pan_us((PAN_MIN_US + PAN_MAX_US) / 2);
    ESP_LOGI(TAG, "PAN returned to CENTER");
}

static void test_tilt_range(void) {
    ESP_LOGI(TAG, "Testing TILT range: %d to %d us", TILT_MIN_US, TILT_MAX_US);
    set_tilt_us(TILT_MIN_US);
    ESP_LOGI(TAG, "TILT at MIN (%d us) - Check position", TILT_MIN_US);
    vTaskDelay(pdMS_TO_TICKS(2000));

    set_tilt_us(TILT_MAX_US);
    ESP_LOGI(TAG, "TILT at MAX (%d us) - Check position", TILT_MAX_US);
    vTaskDelay(pdMS_TO_TICKS(2000));

    set_tilt_us((TILT_MIN_US + TILT_MAX_US) / 2);
    ESP_LOGI(TAG, "TILT returned to CENTER");
}

/* =========================================================
   UART / SERIAL COMMAND HANDLER
   
   This lets you control the servos by typing commands into
   a serial monitor (115200 baud) while the ESP32 is plugged into USB.
   
   Available commands:
     PANUS:1500    → Move pan servo to 1500µs
     TILTUS:1200   → Move tilt servo to 1200µs
     CENTER        → Move both servos to center
     STOP          → Stop sweep immediately and return to center
     PAUSE         → Freeze servos in place during a sweep
     RESUME        → Continue sweep from where it paused
     TESTPAN       → Run the pan range test
     TESTTILT      → Run the tilt range test
     SWEEP         → Run the full sweep pattern
     HELP          → Print the command list
   
   handle_command() reads one line of text and executes the matching command.
   uart_task() runs in the background, constantly reading from the USB serial port.
   ========================================================= */

// Helper: write a string + newline back to the serial monitor
static void uart_send_line(const char *s) {
    uart_write_bytes(UART_PORT, s, strlen(s));
    uart_write_bytes(UART_PORT, "\r\n", 2);
}

// Print the list of commands to the serial monitor
static void print_help(void) {
    uart_send_line("===== Pan/Tilt Control Commands =====");
    uart_send_line("  PANUS:<value>     - Set pan position (e.g., PANUS:1500)");
    uart_send_line("  TILTUS:<value>    - Set tilt position (e.g., TILTUS:1500)");
    uart_send_line("  CENTER            - Move both servos to center");
    uart_send_line("  STOP              - Stop sweep immediately and return to center");
    uart_send_line("  PAUSE             - Freeze servos in place during sweep");
    uart_send_line("  RESUME            - Continue sweep from where it paused");
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

// Parse and execute one line of text received over serial
static void handle_command(char *line) {
    // Trim leading/trailing whitespace and newlines
    while (*line && isspace((unsigned char)*line)) line++;
    size_t n = strlen(line);
    while (n > 0 && isspace((unsigned char)line[n - 1])) line[--n] = '\0';
    if (n == 0) return; // Empty line — ignore

    // Match the command and call the appropriate function
    if (strncmp(line, "PANUS:", 6) == 0) {
        int us = atoi(line + 6); // Parse the number after the colon
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

    } else if (strcmp(line, "STOP") == 0) {
        // Set the flag — sweep_task checks this at every tilt step and will
        // exit and return to center within one tilt step (~100ms worst case)
        if (sweep_task_handle != NULL) {
            pause_requested = false; // Clear pause so the sweep loop wakes up and sees STOP
            stop_requested  = true;
            uart_send_line("STOP sent — servos returning to center...");
        } else {
            uart_send_line("No sweep running.");
        }

    } else if (strcmp(line, "PAUSE") == 0) {
        // Freeze the sweep in place — servos hold their current position
        if (sweep_task_handle != NULL) {
            pause_requested = true;
            uart_send_line("PAUSE sent — servos will freeze at current position.");
        } else {
            uart_send_line("No sweep running.");
        }

    } else if (strcmp(line, "RESUME") == 0) {
        // Clear the pause flag — sweep_task wakes up and continues from where it was
        if (sweep_task_handle != NULL) {
            pause_requested = false;
            uart_send_line("RESUME sent.");
        } else {
            uart_send_line("No sweep running.");
        }

    } else if (strcmp(line, "TESTPAN") == 0) {
        test_pan_range();
        uart_send_line("OK: Pan test complete");

    } else if (strcmp(line, "TESTTILT") == 0) {
        test_tilt_range();
        uart_send_line("OK: Tilt test complete");

    } else if (strcmp(line, "SWEEP") == 0) {
        do_sweep(); // Launches sweep in background — returns immediately so UART stays live

    } else if (strcmp(line, "HELP") == 0) {
        print_help();

    } else {
        uart_send_line("ERROR: Unknown command. Type HELP for commands.");
    }
}

// Background task that continuously reads characters from USB serial,
// builds them into a line, and calls handle_command() when Enter is pressed
static void uart_task(void *arg) {
    uint8_t *rx = (uint8_t *)malloc(UART_RX_BUF);
    if (!rx) vTaskDelete(NULL); // Bail if memory allocation failed

    char line[128];
    int line_len = 0;

    while (1) {
        // Read however many bytes are available (non-blocking, 100ms timeout)
        int len = uart_read_bytes(UART_PORT, rx, UART_RX_BUF, pdMS_TO_TICKS(100));
        for (int i = 0; i < len; i++) {
            char c = (char)rx[i];

            if (c == '\r' || c == '\n') {
                // End of line — process whatever we've collected so far
                if (line_len > 0) {
                    line[line_len] = '\0';
                    handle_command(line);
                    line_len = 0; // Reset for next command
                }
            } else {
                // Normal character — add to the line buffer
                if (line_len < (int)sizeof(line) - 1) {
                    line[line_len++] = c;
                }
            }
        }
    }
}

/* =========================================================
   HTTP SERVER — HANDLERS
   
   These functions handle incoming HTTP requests from a browser or app.
   Each function corresponds to one URL endpoint:
   
     POST /sweep          → run the sweep pattern
     POST /stop           → stop sweep and return to center
     POST /pause          → freeze servos in place
     POST /resume         → continue sweep from paused position
     POST /center         → center both servos
     POST /pan?us=1500    → move pan to 1500µs
     POST /tilt?us=1200   → move tilt to 1200µs
     GET  /status         → returns JSON with device info
   
   CORS headers are added so browser-based apps (like the frontend)
   can make requests without being blocked.
   ========================================================= */

static httpd_handle_t server = NULL;

// Add CORS headers to every response so browsers don't block the request
static esp_err_t set_cors_headers(httpd_req_t *req) {
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Headers", "Content-Type");
    return ESP_OK;
}

// Handles browser "preflight" OPTIONS requests (sent automatically before POST requests)
static esp_err_t options_handler(httpd_req_t *req) {
    set_cors_headers(req);
    httpd_resp_send(req, NULL, 0); // Empty response — just confirms the request is allowed
    return ESP_OK;
}

// POST /sweep — launches sweep in background, returns immediately
static esp_err_t sweep_handler(httpd_req_t *req) {
    set_cors_headers(req);
    ESP_LOGI(TAG, "HTTP: Sweep command received");
    do_sweep();
    httpd_resp_set_type(req, "text/plain");
    httpd_resp_send(req, "OK: Sweep started", 17);
    return ESP_OK;
}

// POST /stop — stops the sweep and returns servos to center
static esp_err_t stop_handler(httpd_req_t *req) {
    set_cors_headers(req);
    ESP_LOGI(TAG, "HTTP: Stop command received");
    if (sweep_task_handle != NULL) {
        pause_requested = false;
        stop_requested  = true;
        httpd_resp_set_type(req, "text/plain");
        httpd_resp_send(req, "OK: Stopping", 12);
    } else {
        httpd_resp_set_type(req, "text/plain");
        httpd_resp_send(req, "OK: No sweep running", 20);
    }
    return ESP_OK;
}

// POST /pause — freezes servos at current position
static esp_err_t pause_handler(httpd_req_t *req) {
    set_cors_headers(req);
    ESP_LOGI(TAG, "HTTP: Pause command received");
    if (sweep_task_handle != NULL) {
        pause_requested = true;
        httpd_resp_set_type(req, "text/plain");
        httpd_resp_send(req, "OK: Paused", 10);
    } else {
        httpd_resp_set_type(req, "text/plain");
        httpd_resp_send(req, "OK: No sweep running", 20);
    }
    return ESP_OK;
}

// POST /resume — continues sweep from where it paused
static esp_err_t resume_handler(httpd_req_t *req) {
    set_cors_headers(req);
    ESP_LOGI(TAG, "HTTP: Resume command received");
    if (sweep_task_handle != NULL) {
        pause_requested = false;
        httpd_resp_set_type(req, "text/plain");
        httpd_resp_send(req, "OK: Resumed", 11);
    } else {
        httpd_resp_set_type(req, "text/plain");
        httpd_resp_send(req, "OK: No sweep running", 20);
    }
    return ESP_OK;
}

// POST /center — moves both servos back to center position
static esp_err_t center_handler(httpd_req_t *req) {
    set_cors_headers(req);
    ESP_LOGI(TAG, "HTTP: Center command received");
    center_both();
    httpd_resp_set_type(req, "text/plain");
    httpd_resp_send(req, "OK", 2);
    return ESP_OK;
}

// POST /pan?us=<value> — moves pan servo to specified microsecond value
// Example: POST http://192.168.1.50:8080/pan?us=1000
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
    // If the "us" parameter is missing, return a 400 error
    httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Missing 'us' parameter");
    return ESP_FAIL;
}

// POST /tilt?us=<value> — moves tilt servo to specified microsecond value
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

// GET /status — returns device info as JSON (useful for debugging connectivity)
// Example response: {"status":"ready","pan_range":[520,2520],"tilt_range":[200,1700]}
static esp_err_t status_handler(httpd_req_t *req) {
    set_cors_headers(req);
    char response[128];
    const char *status = sweep_task_handle == NULL ? "ready" :
                         pause_requested           ? "paused" : "sweeping";
    snprintf(response, sizeof(response),
             "{\"status\":\"%s\",\"pan_range\":[%d,%d],\"tilt_range\":[%d,%d]}",
             status, PAN_MIN_US, PAN_MAX_US, TILT_MIN_US, TILT_MAX_US);
    httpd_resp_set_type(req, "application/json");
    httpd_resp_send(req, response, strlen(response));
    return ESP_OK;
}

/* =========================================================
   HTTP SERVER STARTUP
   
   Registers all the URL handlers defined above and starts listening.
   This is called automatically from the WiFi event handler once
   the ESP32 gets an IP address — you don't call it manually.
   ========================================================= */
static httpd_handle_t start_http_server(void) {
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.server_port = HTTP_SERVER_PORT;
    config.lru_purge_enable = true; // Automatically free old connections if too many open
    config.max_open_sockets = 7;   // ← add this
    config.max_uri_handlers = 20;  // ← add this (you have a lot of routes)

    ESP_LOGI(TAG, "Starting HTTP server on port %d", config.server_port);

    if (httpd_start(&server, &config) == ESP_OK) {
        // Register each URL route and its handler function
        httpd_uri_t sweep_uri = { .uri="/sweep", .method=HTTP_POST, .handler=sweep_handler };
        httpd_register_uri_handler(server, &sweep_uri);

        httpd_uri_t sweep_options = { .uri="/sweep", .method=HTTP_OPTIONS, .handler=options_handler };
        httpd_register_uri_handler(server, &sweep_options);

        // /stop endpoint — same idea as typing STOP in the serial monitor
        httpd_uri_t stop_uri = { .uri="/stop", .method=HTTP_POST, .handler=stop_handler };
        httpd_register_uri_handler(server, &stop_uri);

        httpd_uri_t stop_options = { .uri="/stop", .method=HTTP_OPTIONS, .handler=options_handler };
        httpd_register_uri_handler(server, &stop_options);

        // /pause endpoint — freezes servos in place
        httpd_uri_t pause_uri = { .uri="/pause", .method=HTTP_POST, .handler=pause_handler };
        httpd_register_uri_handler(server, &pause_uri);

        httpd_uri_t pause_options = { .uri="/pause", .method=HTTP_OPTIONS, .handler=options_handler };
        httpd_register_uri_handler(server, &pause_options);

        // /resume endpoint — continues sweep from paused position
        httpd_uri_t resume_uri = { .uri="/resume", .method=HTTP_POST, .handler=resume_handler };
        httpd_register_uri_handler(server, &resume_uri);

        httpd_uri_t resume_options = { .uri="/resume", .method=HTTP_OPTIONS, .handler=options_handler };
        httpd_register_uri_handler(server, &resume_options);

        httpd_uri_t center_uri = { .uri="/center", .method=HTTP_POST, .handler=center_handler };
        httpd_register_uri_handler(server, &center_uri);

        httpd_uri_t center_options = { .uri="/center", .method=HTTP_OPTIONS, .handler=options_handler };
        httpd_register_uri_handler(server, &center_options);

        httpd_uri_t pan_uri = { .uri="/pan", .method=HTTP_POST, .handler=pan_handler };
        httpd_register_uri_handler(server, &pan_uri);

        httpd_uri_t tilt_uri = { .uri="/tilt", .method=HTTP_POST, .handler=tilt_handler };
        httpd_register_uri_handler(server, &tilt_uri);

        httpd_uri_t status_uri = { .uri="/status", .method=HTTP_GET, .handler=status_handler };
        httpd_register_uri_handler(server, &status_uri);

        return server;
    }

    ESP_LOGI(TAG, "Error starting HTTP server");
    return NULL;
}

/* =========================================================
   APP_MAIN — ENTRY POINT
   
   This is where the ESP32 starts when it powers on or resets.
   Everything runs in this order:
   
   1. Initialize NVS (non-volatile storage — required by WiFi driver)
   2. Start WiFi (connects to router, then auto-starts HTTP server)
   3. Set up UART (serial monitor commands)
   4. Initialize servo PWM hardware
   5. Center both servos at startup
   6. Start the UART background task
   7. Idle loop (keeps the main task alive)
   ========================================================= */
void app_main(void) {
    ESP_LOGI(TAG, "========================================");
    ESP_LOGI(TAG, "Starting Pan/Tilt Servo Controller");
    ESP_LOGI(TAG, "========================================");

    // --- 1. NVS (flash storage) — WiFi driver stores calibration data here ---
    // If flash is corrupted or from an older firmware, erase and reinitialize it
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    // --- 2. WiFi — connects to router, HTTP server starts automatically on connection ---
    wifi_init_sta();

    // --- 3. UART (USB serial) — set baud rate, install driver ---
    uart_config_t uart_cfg = {
        .baud_rate = UART_BAUD,         // 115200 — match this in your serial monitor
        .data_bits = UART_DATA_8_BITS,
        .parity    = UART_PARITY_DISABLE,
        .stop_bits = UART_STOP_BITS_1,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE
    };
    ESP_ERROR_CHECK(uart_driver_install(UART_PORT, UART_RX_BUF * 2, 0, 0, NULL, 0));
    ESP_ERROR_CHECK(uart_param_config(UART_PORT, &uart_cfg));

    // --- 4. Servo hardware — set up the PWM timer and output pins ---
    ledc_servo_init();

    // --- 5. Center servos on startup so they're in a known position ---
    vTaskDelay(pdMS_TO_TICKS(100));   // Short delay to let hardware settle
    center_both();
    vTaskDelay(pdMS_TO_TICKS(300));

    // --- Print welcome message to serial monitor ---
    uart_send_line("");
    uart_send_line("========================================");
    uart_send_line("Pan/Tilt Controller Ready!");
    uart_send_line("========================================");
    uart_send_line("Type HELP to see available commands");
    uart_send_line("");

    // --- 6. Start the UART background task ---
    // This runs uart_task() in a loop on a separate FreeRTOS task (4KB stack, priority 5)
    xTaskCreate(uart_task, "uart_task", 4096, NULL, 5, NULL);

    // --- HTTP server will start automatically once WiFi gets an IP address ---

    // --- 7. Idle loop — keeps app_main alive so the other tasks keep running ---
    while (1) {
        vTaskDelay(pdMS_TO_TICKS(1000)); // Sleep 1 second at a time (nothing to do here)
    }
}