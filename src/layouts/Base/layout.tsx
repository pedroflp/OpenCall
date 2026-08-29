'use client';

import { UserDTO } from '@/app/api/user/types';
import React from 'react';
import SectionsSidebar from '../SectionsSidebar';

export default function BaseLayoutElements({ user, children, sidebarCollapsed }: {
  user: UserDTO | null,
  children: React.ReactNode,
  sidebarCollapsed?: boolean,
}) {
  return (
    <main className="overflow-hidden">
      <main className="w-full h-screen overflow-hidden flex flex-row">
        <SectionsSidebar user={user} initialCollapsed={sidebarCollapsed} />

        <div className="max-h-full w-full bg-background overflow-scroll p-16">
          {React.Children.map(children, (child: any) =>
            React.isValidElement(child)
              ? React.cloneElement<any>(child, {
                user,
              })
              : child
          )}
        </div>
      </main>
    </main>
  )
}
