'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Modal from '@/components/Modal'
import { welcomeDismissedKey } from '@/lib/welcomeDismissal'

interface WelcomeUser {
  id: number
  name: string
  roles?: string[] | null
  assignments?: Array<{ role: string }> | null
}

type UserRole = 'siteAdmin' | 'subjectAdmin' | 'teacher'

function getRole(user: WelcomeUser): UserRole {
  if (user.roles?.includes('siteAdmin')) return 'siteAdmin'
  if (user.assignments?.some((a) => a.role === 'subjectAdmin')) return 'subjectAdmin'
  return 'teacher'
}

/**
 * Shown ONCE per account on this browser (operator, 2026-10-20). It used to be remembered only when
 * "Don't show this again" was ticked, so closing it normally brought it back on every page load —
 * reported as popping up relentlessly. It is now recorded as seen the moment it appears, and
 * following one of its links closes it too (a link moves within the same layout, which would
 * otherwise carry the open dialog onto the next page).
 */
export default function WelcomeDialog({ user }: { user: WelcomeUser }) {
  const [visible, setVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try {
      return !localStorage.getItem(welcomeDismissedKey(user.id))
    } catch {
      return true
    }
  })
  const role = getRole(user)

  useEffect(() => {
    if (!visible) return
    try {
      localStorage.setItem(welcomeDismissedKey(user.id), '1')
    } catch {
      // Storage quota or policy failure: it may show again next time; nothing else to do.
    }
  }, [visible, user.id])

  const dismiss = () => setVisible(false)

  if (!visible) return null

  return (
    <Modal title={`Welcome, ${user.name}!`} onClose={dismiss} className="modal--welcome">
      <button className="welcome-close" onClick={dismiss} aria-label="Dismiss">
        ×
      </button>
      <div
        onClick={(event) => {
          if ((event.target as Element).closest('a')) dismiss()
        }}
      >
        {role === 'teacher' && <TeacherContent />}
        {role === 'subjectAdmin' && <SubjectAdminContent />}
        {role === 'siteAdmin' && <SiteAdminContent />}
      </div>
    </Modal>
  )
}

interface NavItem {
  label: string
  highlight?: boolean
  arrowLabel?: string
}

function NavDemo({ items }: { items: NavItem[] }) {
  return (
    <div className="welcome-nav-demo" aria-hidden="true">
      {items.map((item) => (
        <div key={item.label} className="welcome-nav-col">
          <span className={`welcome-nav-chip${item.highlight ? ' welcome-nav-chip--active' : ''}`}>
            {item.label}
          </span>
          {item.arrowLabel && (
            <span className="welcome-nav-arrow">
              <span>↑</span>
              {item.arrowLabel}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function TeacherContent() {
  return (
    <>
      <p className="welcome-body">You can browse, search, and download lesson plans.</p>
      <NavDemo
        items={[
          { label: 'Lessons', highlight: true, arrowLabel: 'Browse here' },
          { label: 'Discuss', arrowLabel: 'Comment on lessons' },
        ]}
      />
      <p className="welcome-body">
        To edit lesson plans, message your <strong>subject or site administrator</strong> for
        permission.
        <br />
        <Link href="/messages">Send a message →</Link>
      </p>
    </>
  )
}

function SubjectAdminContent() {
  return (
    <>
      <p className="welcome-body">
        You can edit lesson plans for your subject and grade, and manage teacher access.
      </p>
      <NavDemo
        items={[
          { label: 'Lessons', arrowLabel: 'View & edit' },
          { label: 'Discuss' },
          { label: 'Manage', highlight: true, arrowLabel: 'Manage teachers' },
        ]}
      />
      <p className="welcome-body">
        Under <strong>Manage</strong>, you can give teachers editing access for your subject and
        grade.
      </p>
    </>
  )
}

function SiteAdminContent() {
  return (
    <>
      <p className="welcome-body">A few things to do to get started:</p>
      <ol className="welcome-checklist">
        <li>
          <Link href="/guide?open=site-admins&at=site-admins.backups">
            Commission off-server backups
          </Link>
          <span className="welcome-checklist__note"> — follow the Backups guide</span>
        </li>
        <li>
          <Link href="/admin/collections/users">Add your teachers</Link>
          <span className="welcome-checklist__note"> — Manage → Users</span>
        </li>
        <li>
          <Link href="/admin/collections/users">Set user roles</Link>
          <span className="welcome-checklist__note"> — give teachers advanced privileges</span>
        </li>
        <li>
          <Link href="/lessons">Review your lesson plans</Link>
          <span className="welcome-checklist__note">
            {' '}
            — check, update, or add new ones (individually, in groups, or as a ZIP)
          </span>
        </li>
      </ol>
    </>
  )
}
