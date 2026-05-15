import { ImageResponse } from "next/og";
import { fetchProductMetadataBySlug } from "@/lib/firebase/firestore-server";

export const runtime = "edge";

export const size = {
  width: 1200,
  height: 630
};

export const contentType = "image/png";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function ProductOpenGraphImage({ params }: Props) {
  const { slug } = await params;

  // includeHidden: true — generate a valid image even for hidden products
  // revalidate: 3600 — allow edge/CDN caching for 1 hour
  const product = await fetchProductMetadataBySlug(slug, {
    revalidate: 3600,
    includeHidden: true
  }).catch(() => null);

  const name = product?.name ?? "Product";

  const price =
    product?.price != null
      ? new Intl.NumberFormat("en-PK", {
          style: "currency",
          currency: product.currency || "PKR",
          maximumFractionDigits: 0
        }).format(product.price)
      : null;

  const stockLabel =
    product?.stockStatus === "in_stock"
      ? "In stock"
      : product?.stockStatus === "low_stock"
        ? "Low stock"
        : product?.stockStatus === "sold_out"
          ? "Sold out"
          : null;

  const stockColor =
    product?.stockStatus === "in_stock"
      ? "#16c16b"
      : product?.stockStatus === "low_stock"
        ? "#e07b00"
        : product?.stockStatus === "sold_out"
          ? "#c0392b"
          : "#6d6253";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px 64px",
          background:
            "linear-gradient(135deg, rgba(251,248,242,1) 0%, rgba(247,243,235,1) 42%, rgba(255,248,239,1) 100%)",
          fontFamily: "Segoe UI, sans-serif"
        }}
      >
        {/* Top: category label */}
        <div
          style={{
            display: "flex",
            fontSize: "22px",
            fontWeight: 600,
            color: "#9d8f7f",
            letterSpacing: "0.06em",
            textTransform: "uppercase"
          }}
        >
          {product?.categoryName ?? ""}
        </div>

        {/* Middle: name + price + stock */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "24px",
            flex: 1,
            justifyContent: "center"
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: name.length > 40 ? "62px" : "80px",
              fontWeight: 900,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              color: "#1f1a14",
              maxWidth: "1000px"
            }}
          >
            {name}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "24px"
            }}
          >
            {price ? (
              <div
                style={{
                  display: "flex",
                  fontSize: "44px",
                  fontWeight: 800,
                  color: "#1f1a14",
                  letterSpacing: "-0.02em"
                }}
              >
                {price}
              </div>
            ) : null}
            {stockLabel ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "8px 22px",
                  borderRadius: "999px",
                  background: `${stockColor}1a`,
                  fontSize: "28px",
                  fontWeight: 700,
                  color: stockColor
                }}
              >
                {stockLabel}
              </div>
            ) : null}
          </div>
        </div>

        {/* Bottom: WAT App branding */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "14px"
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "54px",
              height: "54px",
              borderRadius: "14px",
              background: "#fffdf8",
              border: "1px solid #e9dccb",
              boxShadow: "0 4px 12px rgba(44, 27, 3, 0.08)",
              fontSize: "15px",
              fontWeight: 800,
              color: "#12653d"
            }}
          >
            WAT
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "2px"
            }}
          >
            <span
              style={{
                fontSize: "18px",
                fontWeight: 700,
                color: "#12653d",
                letterSpacing: "0.12em",
                textTransform: "uppercase"
              }}
            >
              WAT App
            </span>
            <span style={{ fontSize: "15px", color: "#9d8f7f" }}>watapp.pk</span>
          </div>
        </div>
      </div>
    ),
    size
  );
}
