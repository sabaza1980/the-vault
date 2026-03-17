import { useRef, useState, useCallback } from 'react';
import html2canvas from 'html2canvas';

export function useShareCard({ card, cards, mode }) {
  const containerRef = useRef(null);
  const [imageBlob, setImageBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [capturing, setCapturing] = useState(false);

  const capture = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return null;
    setCapturing(true);
    try {
      const canvas = await html2canvas(el, {
        useCORS: false,
        allowTaint: true,
        backgroundColor: '#07070f',
        scale: 2,
        logging: false,
        imageTimeout: 0,
      });
      return await new Promise((resolve) => {
        canvas.toBlob((blob) => {
          if (!blob) {
            setCapturing(false);
            resolve(null);
            return;
          }
          const url = URL.createObjectURL(blob);
          setImageBlob(blob);
          setPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
          setCapturing(false);
          resolve({ blob, url });
        }, 'image/png');
      });
    } catch (err) {
      console.error('html2canvas capture error', err);
      setCapturing(false);
      return null;
    }
  }, []);

  const share = useCallback(
    async (destination) => {
      const cardName = card?.playerName || 'Card';
      const shareUrl = 'https://myvaults.io';
      const shareTitle =
        mode === 'card' ? `${cardName} — The Vault` : 'My Trading Card Vault';
      const shareText =
        mode === 'card'
          ? `Check out my ${cardName} on The Vault!`
          : 'Check out my trading card collection on The Vault!';

      if (destination === 'download') {
        if (!imageBlob) return false;
        const a = document.createElement('a');
        const objUrl = URL.createObjectURL(imageBlob);
        a.href = objUrl;
        a.download = `vault-${mode}-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(objUrl);
        return true;
      }

      if (destination === 'native') {
        if (!imageBlob) return false;
        const file = new File([imageBlob], 'vault-share.png', { type: 'image/png' });
        try {
          if (navigator.share && navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: shareTitle, text: shareText, url: shareUrl });
          } else if (navigator.share) {
            await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
          }
        } catch (err) {
          if (err.name !== 'AbortError') console.error('Web Share error', err);
        }
        return true;
      }

      if (destination === 'whatsapp') {
        window.open(
          `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`,
          '_blank',
          'noopener,noreferrer'
        );
        return true;
      }

      if (destination === 'facebook') {
        window.open(
          `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
          '_blank',
          'noopener,noreferrer'
        );
        return true;
      }

      if (destination === 'reddit') {
        window.open(
          `https://reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(shareTitle)}`,
          '_blank',
          'noopener,noreferrer'
        );
        return true;
      }

      if (destination === 'copy') {
        try {
          await navigator.clipboard.writeText(shareUrl);
        } catch {
          const ta = document.createElement('textarea');
          ta.value = shareUrl;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        return true;
      }

      return false;
    },
    [imageBlob, card, mode]
  );

  return { containerRef, capture, share, imageBlob, previewUrl, capturing };
}
