'use client'

import { signIn } from 'next-auth/react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export default function DiscordOAuth({ collapsed = false }: { collapsed?: boolean }) {
  const t = useTranslations('auth');

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={() => signIn('discord')}
            size="icon"
            aria-label={t('signInWithDiscord')}
            className='bg-[#7289da] hover:bg-[#677bc4] text-white'
          >
            <img src="/assets/icons/discord.svg" width={24} height={24} alt="" className="size-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">{t('signInWithDiscord')}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button
      onClick={() => signIn('discord')}
      className='bg-[#7289da] hover:bg-[#677bc4] py-6 w-full text-white gap-2'
    >
      <Image src="/assets/icons/discord.svg" width={24} height={24} alt="" className="size-5" />
      <span>{t('signInWithDiscord')}</span>
    </Button>
  )
}
