# ActivKlass UI Copy & Casing Conventions

**Established:** 2026-10-14  
**Governing Issue:** T-180 (owner decision Option a)  
**Lane Owner:** UI/UX Lane (`docs/UI-COPY.md`, referenced from `OWNERSHIP.md`)  
**Cross-References:** T-157 (round 1), T-164 (round 2), T-176 (round 3), T-178 (round 4)

---

## 1. Why This Document Exists

Between 2026-10-09 and 2026-10-14, ActivKlass underwent four successive rounds of casing tickets:

- **T-157** (2026-10-09, 8 tickets): Teacher dashboard, reports, performance, record, attendance, and account screens.
- **T-164** (2026-10-11, 4 tickets): Landing page hero, nav links, feature cards, and admin term-dates card.
- **T-176** (2026-10-12, 5 tickets): Five teacher screens (Student accounts, Account profile, Announcements, My Classes sort menu, New Class modal).
- **T-178** (2026-10-14, 22 tickets): Product-wide casing sweep across admin, teacher, and student portals.

The rounds did not converge because casing conventions existed only in memory and were not written down or referenced in developer guidelines (`OWNERSHIP.md`). New screens continuously introduced mixed sentence-case labels that testers repeatedly flagged.

Per the owner's decision on 2026-10-14 (T-180, Option a), this document establishes the authoritative UI copy and casing convention for ActivKlass. Any future pane building or modifying screens must adhere to these rules.

---

## 2. Title Case Rules

All structural UI navigation, interactive elements, headings, and field identifiers use **Title Case**. Every significant word is capitalised.

### What Goes in Title Case:
1. **Page & Section Headings (`<h1>`–`<h6>`)**:
   - Examples: `Enrollment Overview`, `Your Classes`, `Grade Distribution`, `Component Averages`, `Top Performers`, `Grade Configuration`.
2. **Card Titles & Panel Headers**:
   - Examples: `Term End Dates & Automatic Archiving`, `Your Profile`, `Your School`, `Class Overview`.
3. **Field Labels (Form Inputs, Textareas, Selects)**:
   - Examples: `First Name`, `Middle Name`, `Last Name`, `Student Number`, `Personal Email`, `Into Class`, `Subject Name`.
4. **Buttons & Form Submit Actions**:
   - Examples: `Add Student`, `Create Class`, `Save Profile`, `Change Password`, `Take Attendance`, `Sign Out`, `See How It Works`.
5. **Menu & Dropdown Option Labels**:
   - Visible labels of `<select>` options use Title Case.
   - Examples: `Last Accessed`, `Subject Name`, `All My Classes (Global)`.
   - *Note: Only the user-facing option labels are Title Case; underlying `value` attributes (e.g. `'az'`, `'default'`) must never change.*
6. **Empty-State Headings**:
   - Examples: `No Announcements Yet`, `Empty Roster`.
7. **Navigation Items & Action Links**:
   - Examples: `How It Works`, `Sign In`, `Class Analytics`, `Manage Classes`.
8. **Toggles, Tab Labels & Quick Action Cards**:
   - Examples: `By Day`, `Whole Term`, `All Saved`, `New Class`, `Add a Section`, `Create a Quiz`, `Mark Today's Attendance`, `Build or Generate with AI`.

### Capitalisation Specifics:
- **Hyphenated Compounds**: Capitalise both words across the hyphen.
  - Examples: `AI-Driven Remediation`, `Privacy-First By Design`.
- **Prepositions & Conjunctions**: Minor words (*with, or, for, and*) can remain lowercase unless leading or prominent in a short action:
  - Examples: `Build or Generate with AI`, `Select a Class Section`, `By Class`.

---

## 3. Sentence Case / Prose Rules (Do NOT Title Case)

The following UI elements MUST NOT be converted to Title Case:

1. **Sentences & Body Copy**:
   - Paragraphs, descriptions, hero explanatory prose, and modal instructions remain standard sentence case.
   - Example: *"Automated grade computation, predictive remediation, and a privacy-first design..."* (`src/routes/index.jsx:266`).
2. **Helper Copy & Guidance Text**:
   - Explanatory subtext placed below form fields or warnings.
   - Example: *"Defaults to pass1234 if left blank"*, *"A student counts as assessed once they have at least one recorded grade."*
3. **Metric Subtexts & Unit Descriptors**:
   - Subtexts appearing below numerical statistics or metrics that read as sentence fragments.
   - Examples: `per section`, `all filled`, `open seats`.
4. **Input Placeholders**:
   - Instructional placeholder text that illustrates example input.
   - Examples: `e.g. Math 101`, `user@example.com`.
5. **Stored Enum & Data Values**:
   - Raw database keys and enum values from Firestore or Flask (e.g. `institution`, `teacher`, `pilot`, `standard`, `plus`) MUST NEVER be changed in stored records. Transform for display in the component if Title Case display is required.

---

## 4. Settled Spelling of `(Optional)`

When indicating an optional input field or parameter, always use:

$$\text{\bf (Optional)}$$

- **Capital `O`**: `(Optional)`
- **Never lowercase**: `(optional)` is disallowed.

**Standard Examples:**
- `Middle Name (Optional)`
- `Department (Optional)`
- `Syllabus (Optional)`
- `Instructions (Optional)`
- `Expires On (Optional)`

This was formally settled in **T-176** (following inconsistent lowercase/uppercase pairings found on the same form in `andecobs-250`) and confirmed product-wide in **T-178** and **T-180**.

---

## 5. Rules for Panes and Future Changes

1. **Check Before Sweeping**: Never run blind find-and-replace scripts. Verify whether a string is a heading/label or body prose.
2. **Respect Tested Absences**: Do not re-case strings that existing tests intentionally assert are absent (e.g. `AuthLayout.test.jsx`).
3. **Preserve Common Nouns in Prose**: When referencing tabs or tools in explanatory sentences, keep common nouns lowercase unless the noun is part of the formal name (e.g. *"open the Performance tab"*, where `Performance` is the tab name and `tab` is a common noun).
4. **Data vs. Presentation**: Never change stored database values or API payload keys to satisfy display casing. Handle formatting in the view layer.
