// La API de Deezer no envía cabeceras CORS, pero acepta JSONP (`output=jsonp`).
let counter = 0;

export function jsonp<T>(url: string, timeoutMs = 12000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const name = `__mg_jsonp_${Date.now().toString(36)}_${counter++}`;
    const w = window as unknown as Record<string, unknown>;
    const script = document.createElement('script');

    const cleanup = () => {
      clearTimeout(timer);
      // Si la respuesta llega tarde, que no reviente por función inexistente
      w[name] = () => delete w[name];
      script.remove();
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Tiempo de espera agotado'));
    }, timeoutMs);

    w[name] = (data: T) => {
      cleanup();
      delete w[name];
      resolve(data);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error('Error de red'));
    };
    script.src = `${url}${url.includes('?') ? '&' : '?'}output=jsonp&callback=${name}`;
    document.head.appendChild(script);
  });
}
