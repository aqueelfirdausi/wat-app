import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px",
          background:
            "linear-gradient(135deg, rgba(251,248,242,1) 0%, rgba(247,243,235,1) 42%, rgba(255,248,239,1) 100%)",
          color: "#1f1a14",
          fontFamily: "Segoe UI, sans-serif"
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "18px",
            maxWidth: "760px"
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px"
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "88px",
                height: "88px",
                borderRadius: "28px",
                background: "#fffdf8",
                border: "1px solid #e9dccb",
                boxShadow: "0 18px 45px rgba(44, 27, 3, 0.08)",
                fontSize: "28px",
                fontWeight: 800,
                color: "#12653d"
              }}
            >
              WAT
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span
                style={{
                  fontSize: "20px",
                  fontWeight: 700,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "#12653d"
                }}
              >
                WAT App
              </span>
              <span style={{ fontSize: "28px", fontWeight: 700 }}>What&apos;s Available Today</span>
            </div>
          </div>
          <div style={{ fontSize: "68px", fontWeight: 900, lineHeight: 1.02, letterSpacing: "-0.05em" }}>
            Daily live products from WhatsApp Status
          </div>
          <div style={{ fontSize: "28px", lineHeight: 1.4, color: "#6d6253" }}>
            Browse the latest tech and fragrance stock, then message the right team member on WhatsApp in one tap.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "14px",
            flexWrap: "wrap"
          }}
        >
          {["UniverCell PK", "EKO Fragrances", "WhatsApp-first ordering"].map((item) => (
            <div
              key={item}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "12px 18px",
                borderRadius: "999px",
                background: "#f6eee3",
                fontSize: "22px",
                color: "#6d6253",
                fontWeight: 700
              }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
