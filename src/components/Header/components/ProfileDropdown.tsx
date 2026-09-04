'use client';

import { useState } from 'react';
import { UserDTO } from '@/app/api/user/types';
import Avatar from '@/components/Avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { HugeIcon } from '@/components/HugeIcon';
import AudioDeviceSelects from '@/components/VoiceDock/AudioDeviceSelects';
import { LogOut } from 'lucide-react';
import { signOut } from 'next-auth/react';
import { useTranslations } from 'next-intl';

interface ProfileDropdownProps {
  user: UserDTO;
  variant?: 'compact' | 'full';
}

export default function ProfileDropdown({ user, variant = 'compact' }: ProfileDropdownProps) {
  const t = useTranslations('header');
  const tCommon = useTranslations('common');
  const [deviceSettingsOpen, setDeviceSettingsOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className='outline-none w-full'>
        {variant === 'full' ? (
          <div className='flex items-center gap-3 w-full px-2 py-2 rounded-md hover:bg-secondary/60 transition-colors text-left'>
            <Avatar size={10} image={user.avatar} fallback={String(user.username).slice(0, 2)} />
            <div className='flex flex-col min-w-0 flex-1'>
              <span className='text-sm font-semibold text-foreground truncate'>
                {user.username}
              </span>
            </div>
          </div>
        ) : (
          <div className='flex gap-2 items-center'>
            <Avatar size={12} image={user.avatar} fallback={String(user.username).slice(0, 2)} />
          </div>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={variant === 'full' ? 'start' : 'center'} side={variant === 'full' ? 'top' : 'bottom'}>
        <DropdownMenuLabel>
          {t.rich('greeting', { username: user.username, b: (chunks) => <strong>{chunks}</strong> })}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <Popover open={deviceSettingsOpen} onOpenChange={setDeviceSettingsOpen}>
          <PopoverTrigger asChild>
            <DropdownMenuItem
              className='cursor-pointer flex gap-2 items-center'
              onSelect={(event) => {
                event.preventDefault();
                setDeviceSettingsOpen(true);
              }}
            >
              <HugeIcon name="settings-01" size={16} />
              {t('audioDevices')}
            </DropdownMenuItem>
          </PopoverTrigger>
          <PopoverContent align='start' side='right' sideOffset={12}>
            <AudioDeviceSelects active={deviceSettingsOpen} />
          </PopoverContent>
        </Popover>
        <DropdownMenuSeparator />
        <DropdownMenuItem className='cursor-pointer flex gap-2 items-center text-red-500 focus:bg-red-600/70' onClick={handleSignOut}>
          <LogOut size={16} />
          {tCommon('signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
