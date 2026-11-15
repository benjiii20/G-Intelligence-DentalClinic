import type { ComponentType } from 'react';
import { Layout } from './components/Layout';
import { Card } from './components/ui';
import { useT } from './i18n';
import { useStore, type PageKey, type View } from './state/store';

function Soon() {
  const { t } = useT();
  return <Card>{t('common.pageSoon')}</Card>;
}

type PageMap = Partial<Record<PageKey, Partial<Record<View, ComponentType>>>>;
const PAGE_COMPONENTS: PageMap = {};

export default function App() {
  const page = useStore((s) => s.page);
  const view = useStore((s) => s.view);
  const Page = PAGE_COMPONENTS[page]?.[view] ?? Soon;
  return (
    <Layout>
      <Page />
    </Layout>
  );
}
