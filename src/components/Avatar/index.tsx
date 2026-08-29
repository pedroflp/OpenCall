import React from 'react'
import { AvatarFallback, Avatar as AvatarContainer, AvatarImage } from '../ui/avatar'
import { cn } from '@/lib/utils'

export default function Avatar({ image, fallback, className, fallbackSize, size = 12 }: { image?: string, fallbackSize?: "text-xs" | "text-sm" | "text-md" | "text-lg", size?: number, fallback: any, className?: string }) {
  return (
    <AvatarContainer className={cn(
      `w-${size} h-${size}`,
      className
    )}>
      <AvatarImage 
        src={image} 
        width={1000}
        height={1000}
      />
      <AvatarFallback className={
        cn(
          `w-${size} h-${size}`,
          'text-sm font-bold text-secondary-foreground/60 uppercase bg-secondary border-2 w-full h-full',
          fallbackSize)
      }>{fallback}</AvatarFallback>
    </AvatarContainer>
  )
}
