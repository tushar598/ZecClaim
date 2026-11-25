"use client";

import React, { useEffect, useState } from "react";
import QRCode from "qrcode";

export interface LocalQrCodeProps {
  value: string;
  size?: number;
  className?: string;
  title?: string;
}

export function LocalQrCode({
  value,
  size = 180,
  className = "",
  title = "Scan with shielded Zcash wallet",
}: LocalQrCodeProps) {
  const [dataUrl, setDataUrl] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (!value) {
      setDataUrl("");
      return;
    }

    QRCode.toDataURL(value, {
      margin: 1,
      errorCorrectionLevel: "M",
      width: Math.max(size * 2, 256),
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    })
      .then((url) => {
        if (isMounted) {
          setDataUrl(url);
          setError(null);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to generate QR");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [value, size]);

  if (error) {
    return (
      <div
        className={`flex items-center justify-center bg-rose/10 text-rose-fg p-2 text-xs font-mono rounded-lg ${className}`}
        style={{ width: size, height: size }}
      >
        QR Error: {error}
      </div>
    );
  }

  if (!dataUrl) {
    return (
      <div
        className={`flex items-center justify-center bg-white animate-pulse rounded-lg ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  // A data: URL generated locally; next/image would add nothing and could proxy the secret.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={dataUrl}
      alt={title}
      width={size}
      height={size}
      className={`inline-block bg-white rounded-md ${className}`}
      title={title}
      loading="eager"
    />
  );
}
