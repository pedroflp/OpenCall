'use client'

import { Skeleton } from '@/components/ui/skeleton';
import { Menu, X } from 'lucide-react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Fragment } from 'react';
import DiscordOAuth from '../DiscordOAuth';
import { Button } from '../ui/button';
import ProfileDropdown from './components/ProfileDropdown';
import { HeaderProps } from './types';
import { HugeIcon } from '@/components/HugeIcon';

export default function Header({ user, isSidebarOpen, toggleSidebar }: HeaderProps) {
  const { status } = useSession();

  return (
    <Fragment>
      <div className='relative w-full bg-secondary/60 border-b-2 border-border p-4 px-8 flex justify-between items-center'>
        <Button variant="outline" onClick={toggleSidebar}>{isSidebarOpen ? <X size={24} /> : <Menu size={24} />}</Button>
        <div className='flex gap-8 items-center absolute left-1/2 -translate-x-1/2'>
          <Link href={'/'} className='text-2xl font-black text-foreground flex items-center gap-2'>
            <HugeIcon name='shield-01' size={40} />
            <span>OpenCall</span>
          </Link>
        </div>
        {status === 'loading' && !user
          ? <Skeleton className='h-10 w-10 rounded-full' />
          : user
            ? <ProfileDropdown user={user} />
            : <DiscordOAuth />
        }
      </div>
    </Fragment>
  )
}
