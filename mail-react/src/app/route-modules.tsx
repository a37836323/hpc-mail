import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

type FeatureModule = Record<string, unknown> & { default?: ComponentType }

const modules = import.meta.glob<FeatureModule>([
  '../features/auth/LoginPage.tsx',
  '../features/profile/SettingsPage.tsx',
  '../features/admin/UsersPage.tsx',
  '../features/admin/RolesPage.tsx',
  '../features/admin/AllMailPage.tsx',
  '../features/admin/SystemSettingsPage.tsx',
  '../features/admin/InviteKeysPage.tsx',
  '../features/admin/ApiControlPage.tsx',
  '../features/admin/AnalyticsPage.tsx',
  '../features/mail/InboxPage.tsx',
  '../features/mail/SentPage.tsx',
  '../features/mail/StarredPage.tsx',
  '../features/mail/MessagePage.tsx',
  '../features/drafts/DraftsPage.tsx',
  '../features/mailboxes/MailboxManagerPage.tsx',
  '../features/composer/ComposeSheet.tsx',
])

export function lazyFeature(
  path: string,
  exportName: string,
): LazyExoticComponent<ComponentType<Record<string, never>>> {
  const loader = async (): Promise<{ default: ComponentType<Record<string, never>> }> => {
    const load = modules[path]
    if (!load) throw new Error(`Feature module ${path} is not registered`)
    const loaded = await load()
    const component = loaded.default ?? loaded[exportName]
    if (typeof component !== 'function') {
      throw new Error(`Feature module ${path} does not export ${exportName}`)
    }
    return { default: component as ComponentType<Record<string, never>> }
  }
  return lazy(loader)
}

export const LoginPage = lazyFeature('../features/auth/LoginPage.tsx', 'LoginPage')
export const SettingsPage = lazyFeature('../features/profile/SettingsPage.tsx', 'SettingsPage')
export const UsersPage = lazyFeature('../features/admin/UsersPage.tsx', 'UsersPage')
export const RolesPage = lazyFeature('../features/admin/RolesPage.tsx', 'RolesPage')
export const AllMailPage = lazyFeature('../features/admin/AllMailPage.tsx', 'AllMailPage')
export const SystemSettingsPage = lazyFeature('../features/admin/SystemSettingsPage.tsx', 'SystemSettingsPage')
export const InviteKeysPage = lazyFeature('../features/admin/InviteKeysPage.tsx', 'InviteKeysPage')
export const ApiControlPage = lazyFeature('../features/admin/ApiControlPage.tsx', 'ApiControlPage')
export const AnalyticsPage = lazyFeature('../features/admin/AnalyticsPage.tsx', 'AnalyticsPage')
export const InboxPage = lazyFeature('../features/mail/InboxPage.tsx', 'InboxPage')
export const SentPage = lazyFeature('../features/mail/SentPage.tsx', 'SentPage')
export const StarredPage = lazyFeature('../features/mail/StarredPage.tsx', 'StarredPage')
export const MessagePage = lazyFeature('../features/mail/MessagePage.tsx', 'MessagePage')
export const DraftsPage = lazyFeature('../features/drafts/DraftsPage.tsx', 'DraftsPage')
export const MailboxManagerPage = lazyFeature('../features/mailboxes/MailboxManagerPage.tsx', 'MailboxManagerPage')
export const ComposeSheet = lazyFeature('../features/composer/ComposeSheet.tsx', 'ComposeSheet')
