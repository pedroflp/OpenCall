import { ToastProvider } from '@/components/ui/toast';
import BaseLayoutElements from './layout';
import React from 'react';
import { getUserAccountData } from '@/app/api/user/actions';
import { cookies } from 'next/headers';

export default async function BaseLayout({ children }: any) {
  const user = await getUserAccountData();
  const cookieStore = await cookies();
  const sidebarCollapsed = cookieStore.get('opencall:sidebar:collapsed')?.value === '1';

  return (
    <ToastProvider>
      <BaseLayoutElements
        user={user}
        sidebarCollapsed={sidebarCollapsed}
      >
        {children}
      </BaseLayoutElements>
    </ToastProvider>
  )
}
