import { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      username: string
      avatar: string
      accessToken: string
      canalAccess: boolean
      isAdmin: boolean
      isChannelsAdmin: boolean
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
    username?: string
    avatar?: string
    accessToken?: string
    canalAccess?: boolean
    isAdmin?: boolean
    isChannelsAdmin?: boolean
    rolesFetchedAt?: number
  }
}
