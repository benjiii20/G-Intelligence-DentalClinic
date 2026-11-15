import type { ComponentType } from 'react';
import { Layout } from './components/Layout';
import { Card } from './components/ui';
import { useT } from './i18n';
import { OverviewData, PlansData, RevenueData } from './pages/DataPages1';
import { ChairsData, MarketingData, PatientsData } from './pages/DataPages2';
import { OverviewInsights, PlansInsights, RevenueInsights } from './pages/InsightsPages1';
import { ChairsInsights, MarketingInsights, PatientsInsights } from './pages/InsightsPages2';
import { useStore, type PageKey, type View } from './state/store';

function Soon() {
  const { t } = useT();
  return <Card>{t('common.pageSoon')}</Card>;
}

type PageMap = Partial<Record<PageKey, Partial<Record<View, ComponentType>>>>;
const PAGE_COMPONENTS: PageMap = {
  overview: { data: OverviewData, insights: OverviewInsights },
  revenue: { data: RevenueData, insights: RevenueInsights },
  plans: { data: PlansData, insights: PlansInsights },
  marketing: { data: MarketingData, insights: MarketingInsights },
  patients: { data: PatientsData, insights: PatientsInsights },
  chairs: { data: ChairsData, insights: ChairsInsights },
};

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
