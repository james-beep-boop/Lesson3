'use client'

import React, { useEffect, useState } from 'react'
import Modal from '@/components/Modal'

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

function storageKey(userId: number) {
  return `welcome-dismissed-${userId}`
}

export default function WelcomeDialog({ user }: { user: WelcomeUser }) {
  const [visible, setVisible] = useState(false)
  const role = getRole(user)

  useEffect(() => {
    if (!localStorage.getItem(storageKey(user.id))) {
      setVisible(true)
    }
  }, [user.id])

  function dismiss() {
    setVisible(false)
  }

  function handleDontShow(checked: boolean) {
    if (checked) {
      localStorage.setItem(storageKey(user.id), '1')
    } else {
      localStorage.removeItem(storageKey(user.id))
    }
  }

  if (!visible) return null

  return (
    <Modal
      title={`Welcome, ${user.name}!`}
      onClose={dismiss}
      className="modal--welcome"
    >
      <button className="welcome-close" onClick={dismiss} aria-label="Dismiss">
        ×
      </button>
      {role === 'teacher' && <TeacherContent />}
      {role === 'subjectAdmin' && <SubjectAdminContent />}
      {role === 'siteAdmin' && <SiteAdminContent />}
      <label className="welcome-dont-show">
        <input type="checkbox" onChange={(e) => handleDontShow(e.target.checked)} />
        Don't show this again
      </label>
    </Modal>
  )
}

interface NavItem {
  label: string
  href: string
  highlight?: boolean
  arrowLabel?: string
}

function NavDemo({ items }: { items: NavItem[] }) {
  return (
    <div className="welcome-nav-demo" aria-label="Navigation overview" role="presentation">
      {items.map((item) => (
        <div key={item.label} className="welcome-nav-col">
          <a
            href={item.href}
            className={`welcome-nav-chip${item.highlight ? ' welcome-nav-chip--active' : ''}`}
          >
            {item.label}
          </a>
          {item.arrowLabel && (
            <span className="welcome-nav-arrow">
              <span aria-hidden="true">↑</span>
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
          { label: 'Lessons', href: '/lessons', highlight: true, arrowLabel: 'Browse here' },
          { label: 'Discuss', href: '/discuss', arrowLabel: 'Comment on lessons' },
          { label: 'Guide', href: '/guide' },
        ]}
      />
      <p className="welcome-body">
        To edit lesson plans, contact your{' '}
        <strong>subject or site administrator</strong>.{' '}
        <a href="/messages">Send a message →</a>
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
          { label: 'Lessons', href: '/lessons', arrowLabel: 'View & edit' },
          { label: 'Discuss', href: '/discuss' },
          { label: 'Manage', href: '/admin', highlight: true, arrowLabel: 'Manage teachers' },
          { label: 'Guide', href: '/guide' },
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
          <a href="/admin/globals/system-settings">Save your backup key</a>
          <span className="welcome-checklist__note"> — Manage → Settings</span>
        </li>
        <li>
          <a href="/admin/collections/users">Add your teachers</a>
          <span className="welcome-checklist__note"> — Manage → Users</span>
        </li>
        <li>
          <a href="/admin/collections/users">Set user roles</a>
          <span className="welcome-checklist__note"> — give subject admins and editors access</span>
        </li>
        <li>
          <a href="/lessons">Review your lesson plans</a>
          <span className="welcome-checklist__note">
            {' '}— check, update, or add new ones (individually, in groups, or as a ZIP)
          </span>
        </li>
      </ol>
    </>
  )
}
