'use client'

import { signIn } from 'next-auth/react';
import Image from 'next/image';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export default function DiscordOAuth({ collapsed = false }: { collapsed?: boolean }) {
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={() => signIn('discord')}
            size="icon"
            aria-label="Entrar com Discord"
            className='bg-[#7289da] hover:bg-[#677bc4] text-white'
          >
            <img src="/assets/icons/discord.svg" width={24} height={24} alt="" className="size-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Entrar com Discord</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button
      onClick={() => signIn('discord')}
      className='bg-[#7289da] hover:bg-[#677bc4] py-6 w-full text-white gap-2'
    >
      <Image src="/assets/icons/discord.svg" width={24} height={24} alt="" className="size-5" />
      <span>Entrar com Discord</span>
    </Button>
  )
}
