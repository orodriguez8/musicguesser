import { useState, type ImgHTMLAttributes } from 'react';

/** <img> que, si la portada o la foto no cargan, deja un hueco con el estilo de la app en vez del icono roto. */
export function SafeImg(props: ImgHTMLAttributes<HTMLImageElement>) {
  const [failed, setFailed] = useState(false);
  if (failed || !props.src) {
    return (
      <span
        className={props.className ? `img-fallback ${props.className}` : 'img-fallback'}
        style={{ width: props.width, height: props.height }}
        aria-hidden="true"
      />
    );
  }
  return <img alt="" {...props} onError={() => setFailed(true)} />;
}
