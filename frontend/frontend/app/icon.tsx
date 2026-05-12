import { ImageResponse } from 'next/og';

export const size = {
  width: 192,
  height: 192,
};

export const contentType = 'image/png';

export default function Icon() {
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
            width: 144,
            height: 144,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '42px',
            background: 'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)',
            color: '#ffffff',
            fontSize: 72,
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
