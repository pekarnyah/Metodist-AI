import { ImageResponse } from 'next/og';

export const size = {
  width: 180,
  height: 180,
};

export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#020617',
          borderRadius: '36px',
        }}
      >
        <div
          style={{
            display: 'flex',
            width: 136,
            height: 136,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '40px',
            background: 'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)',
            color: '#ffffff',
            fontSize: 68,
            fontWeight: 900,
            letterSpacing: -4,
          }}
        >
          M
        </div>
      </div>
    ),
    size
  );
}
