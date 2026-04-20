import { ImageResponse } from "next/og";
import { fetchProductMetadataBySlug } from "@/lib/firebase/firestore-server";
import { buildProductMetaDescription } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export const size = {
  width: 1200,
  height: 630
};

export const contentType = "image/png";

type ProductImageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function ProductOpenGraphImage({ params }: ProductImageProps) {
  const { slug } = await params;
  const product = await fetchProductMetadataBySlug(slug, { revalidate: false });

  const description = product
    ? buildProductMetaDescription({
        categoryName: product.categoryName,
        condition: product.condition,
        price: product.price,
        currency: product.currency,
        description: product.description
      })
    : "This product link is no longer available.";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          padding: "42px",
          background:
            "linear-gradient(135deg, rgba(251,248,242,1) 0%, rgba(247,243,235,1) 48%, rgba(255,248,239,1) 100%)",
          color: "#1f1a14",
          fontFamily: "Segoe UI, sans-serif",
          gap: "28px"
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "12px 0"
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                color: "#12653d",
                fontSize: "19px",
                fontWeight: 700,
                letterSpacing: "0.16em",
                textTransform: "uppercase"
              }}
            >
              <span>WAT App</span>
              <span style={{ color: "#6d6253", letterSpacing: "0.08em" }}>Product link</span>
            </div>
            <div style={{ fontSize: "60px", fontWeight: 900, lineHeight: 1.02, letterSpacing: "-0.05em" }}>
              {product?.name ?? "Product unavailable"}
            </div>
            <div style={{ fontSize: "28px", color: "#6d6253", lineHeight: 1.45 }}>{description}</div>
          </div>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            {product?.categoryName ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "10px 16px",
                  borderRadius: "999px",
                  background: "#f6eee3",
                  fontSize: "20px",
                  color: "#6d6253",
                  fontWeight: 700
                }}
              >
                {product.categoryName}
              </div>
            ) : null}
            {product?.condition ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "10px 16px",
                  borderRadius: "999px",
                  background: "rgba(31, 143, 88, 0.1)",
                  fontSize: "20px",
                  color: "#12653d",
                  fontWeight: 700
                }}
              >
                {product.condition}
              </div>
            ) : null}
            {product?.featured ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "10px 16px",
                  borderRadius: "999px",
                  background: "rgba(241, 177, 77, 0.2)",
                  fontSize: "20px",
                  color: "#8a5d16",
                  fontWeight: 700
                }}
              >
                Featured
              </div>
            ) : null}
          </div>
        </div>

        <div
          style={{
            width: "380px",
            borderRadius: "28px",
            background: "#fffdf8",
            border: "1px solid #e9dccb",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            boxShadow: "0 18px 45px rgba(44, 27, 3, 0.08)"
          }}
        >
          {product?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt={product.name}
              width="380"
              height="546"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "14px",
                width: "100%",
                height: "100%",
                background: "linear-gradient(135deg, #efe3d1, #fff7ea)",
                color: "#6d6253",
                fontSize: "30px",
                fontWeight: 700
              }}
            >
              <span>WAT App</span>
              <span style={{ fontSize: "22px" }}>Product preview</span>
            </div>
          )}
        </div>
      </div>
    ),
    size
  );
}
