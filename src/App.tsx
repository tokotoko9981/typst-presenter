import { useEffect, useState } from 'react';
import { I18nProvider } from './core/i18n/I18nContext.tsx';
import { AudienceView } from './features/audience/AudienceView.tsx';
import { PresenterConsole } from './features/presenter/PresenterConsole.tsx';

type AppRoute = 'presenter' | 'audience';

function resolveRoute(hash: string): AppRoute {
  const pathPart = hash.replace(/^#/, '').split('?')[0] ?? '/';
  if (pathPart === '/audience' || pathPart.startsWith('/audience/')) {
    return 'audience';
  }
  return 'presenter';
}

export function App() {
  const [route, setRoute] = useState<AppRoute>(() => resolveRoute(window.location.hash));

  useEffect(() => {
    const onHashChange = () => {
      setRoute(resolveRoute(window.location.hash));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <I18nProvider>
      {route === 'audience' ? <AudienceView /> : <PresenterConsole />}
    </I18nProvider>
  );
}

export default App;
