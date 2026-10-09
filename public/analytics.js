'use strict';

// GA4 account: kekoyana / property: 558225327.
// Preview servers and other projects must not contribute production traffic.
(() => {
  if (location.hostname !== 'kekoyana.github.io' ||
      !(location.pathname === '/suiko_manga' || location.pathname.startsWith('/suiko_manga/'))) return;

  const measurementId = 'G-7E7653QC6V';
  let previousLocation = document.referrer || '';
  let lastLocation = null;
  try {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    // History pageviews are also disabled in this stream's Enhanced Measurement settings.
    window.gtag('config', measurementId, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });

    window.mangaAnalytics = {
      pageView() {
        const pageLocation = location.href;
        if (pageLocation === lastLocation) return;
        try {
          window.gtag('event', 'page_view', {
            send_to: measurementId,
            page_title: document.title,
            // The fragment identifies the chapter and page; GA4's default URL omits it.
            page_location: pageLocation,
            page_referrer: previousLocation,
          });
          lastLocation = pageLocation;
          previousLocation = pageLocation;
        } catch { /* Analytics must never interrupt reading. */ }
      },
    };

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
    document.head.appendChild(script);
  } catch { /* Reading also works when the Google tag is unavailable. */ }
})();
