import hugeiconsData from '@iconify-json/hugeicons/icons.json'
import type { SVGProps } from 'react'

const iconsMap = (hugeiconsData as {
  icons: Record<string, { body: string; width?: number; height?: number }>
  width: number
  height: number
}).icons

interface HugeIconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'viewBox' | 'width' | 'height'> {
  name: string
  size?: number
}

export function HugeIcon({ name, size = 24, ...rest }: HugeIconProps) {
  const icon = iconsMap[name]
  if (!icon) return null

  const w = icon.width ?? 24
  const h = icon.height ?? 24

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${w} ${h}`}
      width={size}
      height={size}
      dangerouslySetInnerHTML={{ __html: icon.body }}
      {...rest}
    />
  )
}
