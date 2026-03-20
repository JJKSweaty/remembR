import GoldenOrb from "@/components/GoldenOrb";

export default function Preview() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#ffffff",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 48,
      padding: 48,
    }}>
      <GoldenOrb size={260} intensity="medium" />
    </div>
  );
}
