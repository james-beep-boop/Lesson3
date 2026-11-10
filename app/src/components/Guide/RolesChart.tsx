import React from 'react'

/**
 * The Role notes chart: a worked example of the three user types and how they nest (SPEC §8).
 *
 * Static markup only — the connectors and arrowheads are CSS (`.roles-chart` in styles.css), so the
 * chart needs no client JavaScript and reads in document order for a screen reader: Site
 * administrator, then each subject and grade with its administrator and teachers.
 *
 * ⚑ THE PEOPLE ARE AN EXAMPLE, NOT DATA. The app does not record what a teacher teaches — every
 * signed-in teacher can read every subject and grade. The subject line on a teacher box exists only to
 * show which subject-grade administrator that teacher works under. Wafula appears three times on
 * purpose (operator request 2026-11-10): one person can hold several roles. As Site administrator
 * Wafula can edit everything, so both Wafula teacher boxes say "Editing access"; never mark one "No
 * editing access".
 *
 * ⚑ Three user types, and that is the whole list (CLAUDE.md, SPEC §8). Editing access is a
 * capability shown on a Teacher box, never a box of its own kind.
 */

type Teacher = { name: string; canEdit: boolean }
type Group = { subjectGrade: string; admin: string; teachers: Teacher[] }

export const ROLES_CHART_SITE_ADMIN = 'Wafula'

export const ROLES_CHART_GROUPS: readonly Group[] = [
  {
    subjectGrade: 'Biology Grade 10',
    admin: 'Otieno',
    teachers: [
      { name: 'Otieno', canEdit: true },
      { name: 'Njeri', canEdit: false },
    ],
  },
  {
    subjectGrade: 'Chemistry Grade 10',
    admin: 'Achieng',
    teachers: [{ name: 'Wafula', canEdit: true }],
  },
  {
    subjectGrade: 'Chemistry Grade 11',
    admin: 'Kamau',
    teachers: [
      { name: 'Kamau', canEdit: true },
      { name: 'Wafula', canEdit: true },
    ],
  },
]

export default function RolesChart() {
  return (
    <figure className="roles-chart" aria-label="Example of how the roles fit together">
      <div className="roles-chart__tree">
        <div className="roles-chart__box roles-chart__box--site">
          <strong>Site administrator</strong>
          <span>{ROLES_CHART_SITE_ADMIN}</span>
        </div>
        <ul className="roles-chart__groups">
          {ROLES_CHART_GROUPS.map((group) => (
            <li key={group.subjectGrade} className="roles-chart__group">
              <div className="roles-chart__panel">
                <div className="roles-chart__box roles-chart__box--admin">
                  <strong>Subject-grade administrator</strong>
                  <span>{group.subjectGrade}</span>
                  <span>{group.admin}</span>
                </div>
                <ul className="roles-chart__teachers">
                  {group.teachers.map((teacher) => (
                    <li key={teacher.name} className="roles-chart__teacher">
                      <div
                        className={`roles-chart__box roles-chart__box--teacher${
                          teacher.canEdit ? '' : ' roles-chart__box--read-only'
                        }`}
                      >
                        <strong>Teacher</strong>
                        <span className="roles-chart__subject">{group.subjectGrade}</span>
                        <span>{teacher.name}</span>
                        <span>{teacher.canEdit ? 'Editing access' : 'No editing access'}</span>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="roles-chart__group-name" aria-hidden="true">
                  {group.subjectGrade}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <figcaption>
        <ul className="roles-chart__key">
          <li>
            <span className="roles-chart__swatch roles-chart__swatch--site" aria-hidden="true" />
            Site-wide admin
          </li>
          <li>
            <span className="roles-chart__swatch roles-chart__swatch--admin" aria-hidden="true" />
            One subject and grade admin
          </li>
          <li>
            <span className="roles-chart__swatch roles-chart__swatch--teacher" aria-hidden="true" />
            Teacher with editing access
          </li>
          <li>
            <span
              className="roles-chart__swatch roles-chart__swatch--read-only"
              aria-hidden="true"
            />
            Teacher, read and print only
          </li>
        </ul>
      </figcaption>
    </figure>
  )
}
