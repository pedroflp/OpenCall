
type Link = {
  text: string;
  href: string;
  disabled?: boolean;
}

type SidebarSection = {
  icon?: string;
  title: string;
  links: Link[];
}
