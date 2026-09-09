import { useState } from 'react';
import { mediaUrl } from '../services/api.js';

/**
 * Image that degrades to an emoji tile instead of a broken-image box when the
 * source fails — remote seed URLs and user uploads both go stale eventually.
 *
 * Always renders the same wrapper so `className` controls the box in both
 * states; the image itself just fills it.
 */
export default function FoodImage({ src, alt = '', fallback = '🍛', className = '', imgClassName = '' }) {
  const [failed, setFailed] = useState(false);
  const showFallback = !src || failed;

  return (
    <div className={`overflow-hidden bg-stone-100 ${className}`}>
      {showFallback ? (
        <div className="grid size-full place-items-center text-2xl" role="img" aria-label={alt}>
          <span aria-hidden>{fallback}</span>
        </div>
      ) : (
        <img
          src={mediaUrl(src)}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
          className={`size-full object-cover ${imgClassName}`}
        />
      )}
    </div>
  );
}
