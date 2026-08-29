import { UserDTO } from "@/app/api/user/types"

export type HeaderProps = {
  user: UserDTO | null,
  isSidebarOpen: boolean,
  toggleSidebar: () => void
}