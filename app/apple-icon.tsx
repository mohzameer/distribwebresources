import { ImageResponse } from 'next/og';

/**
 * iOS home-screen icon. Apple's touch icon must be a raster format, so this renders the
 * same mark as icon.svg to PNG at build time rather than shipping a binary asset.
 *
 * No rounded corners here on purpose: iOS applies its own mask, and baking in a radius
 * leaves white slivers at the corners.
 */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  const bar = (width: number, opacity: number) => ({
    width,
    height: 16,
    borderRadius: 8,
    background: '#fff',
    opacity,
  });

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          // Left-aligned to match icon.svg exactly: the same mark in both places, and the
          // ragged right edge is what makes it read as a list rather than a logo.
          alignItems: 'flex-start',
          justifyContent: 'center',
          paddingLeft: 39,
          gap: 16,
          background: '#ff6719',
        }}
      >
        <div style={bar(101, 1)} />
        <div style={bar(67, 0.92)} />
        <div style={bar(84, 0.84)} />
      </div>
    ),
    size,
  );
}
