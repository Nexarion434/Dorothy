'use client';

import {
  LayoutDashboard,
  Bot,
  Columns,
  Archive,
  FolderKanban,
  Sparkles,
  Puzzle,
  CalendarClock,
  Zap,
  BarChart2,
  Brain,
  Gift,
  Settings,
  Moon,
  Sun,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { LATEST_RELEASE, WHATS_NEW_STORAGE_KEY } from '@/data/changelog';
import { useStore } from '@/store';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar';

const PalletTownIcon = ({ className }: { className?: string }) => (
  <img src="/pokemon/p.png" alt="" className={className} style={{ imageRendering: 'pixelated', objectFit: 'contain' }} />
);

const navItems = [
  { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/agents', icon: Bot, label: 'Agents' },
  { href: '/kanban', icon: Columns, label: 'Kanban' },
  { href: '/vault', icon: Archive, label: 'Vault' },
  { href: '/projects', icon: FolderKanban, label: 'Projects' },
  { href: '/skills', icon: Sparkles, label: 'Skills' },
  { href: '/plugins', icon: Puzzle, label: 'Plugins' },
  { href: '/recurring-tasks', icon: CalendarClock, label: 'Scheduled Tasks' },
  { href: '/automations', icon: Zap, label: 'Automations' },
  { href: '/usage', icon: BarChart2, label: 'Usage' },
  { href: '/memory', icon: Brain, label: 'Memory' },
  { href: '/pallet-town', icon: PalletTownIcon, label: 'ClaudeMon' },
];

function useWhatsNewBadge() {
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => {
    const check = () => {
      const lastSeen = Number(localStorage.getItem(WHATS_NEW_STORAGE_KEY) || '0');
      setHasNew(LATEST_RELEASE.id > lastSeen);
    };
    check();
    window.addEventListener('whats-new-seen', check);
    return () => window.removeEventListener('whats-new-seen', check);
  }, []);

  return hasNew;
}

export default function AppSidebar() {
  const pathname = usePathname();
  const { darkMode, toggleDarkMode, vaultUnreadCount } = useStore();
  const whatsNewHasNew = useWhatsNewBadge();

  return (
    <Sidebar collapsible="icon">
      {/* Header — Logo */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/" />}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg overflow-hidden">
                  <img src="/dorothy-without-text.png" alt="Dorothy" className="w-full h-full object-cover scale-150" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Dorothy</span>
                  <span className="truncate text-xs text-muted-foreground">Agent Manager</span>
                </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* Navigation */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = item.href === '/'
                  ? pathname === '/'
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton render={<Link href={item.href} />} isActive={isActive} tooltip={item.label}>
                        <item.icon className="size-4" />
                        <span>{item.label}</span>
                    </SidebarMenuButton>
                    {item.href === '/vault' && vaultUnreadCount > 0 && (
                      <SidebarMenuBadge>{vaultUnreadCount}</SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter>
        <SidebarMenu>
          {/* What's New */}
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link href="/whats-new" />} isActive={pathname === '/whats-new'} tooltip="What's New">
                <div className="relative">
                  <Gift className="size-4" />
                  {whatsNewHasNew && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
                  )}
                </div>
                <span>What&apos;s New</span>
            </SidebarMenuButton>
            {whatsNewHasNew && (
              <SidebarMenuBadge className="bg-red-500 text-white">1</SidebarMenuBadge>
            )}
          </SidebarMenuItem>

          <SidebarSeparator />

          {/* Settings */}
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href="/settings" />}
              isActive={pathname === '/settings' || pathname.startsWith('/settings/')}
              tooltip="Settings"
            >
                <Settings className="size-4" />
                <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {/* Dark Mode Toggle */}
          <SidebarMenuItem>
            <SidebarMenuButton onClick={toggleDarkMode} tooltip={darkMode ? 'Light Mode' : 'Dark Mode'}>
              {darkMode ? <Sun className="size-4" /> : <Moon className="size-4" />}
              <span>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
