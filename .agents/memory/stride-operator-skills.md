---
name: Stride Operator Skills system
description: Skill labels for operators, first-login gate, AI matching in activity wizard step 4.
---

## Tables (pg pool)
- `operator_skills(id, operator_profile_id, organization_id, label, source, created_at)` — UNIQUE(profile_id, label)
- `skill_label_presets(id, organization_id, label)` — UNIQUE(org_id, label); admin custom labels
- `operator_profiles.skills_completed BOOLEAN DEFAULT FALSE` — added via ALTER TABLE in pg.ts

## Backend routes (artifacts/api-server/src/routes/operator-skills.ts)
- `GET /operator-skills` — own skills + skills_completed (operator) or by ?profileId= (admin)
- `GET /operator-skills/all` — all active operators + their skills (admin/super_admin only)
- `PUT /operator-skills` — replace all skills, sets skills_completed=true on operator_profiles (Supabase)
- `GET /skill-presets` — disciplines (Supabase, active) + custom presets (pool)
- `POST /skill-presets` — admin adds custom label (ON CONFLICT DO UPDATE)
- `DELETE /skill-presets/:id` — admin removes custom label
- `POST /operator-skills/ai-match` — GPT-4o-mini ranks top 3 operators by skills fit; fallback = overlap count sort

## API types (lib/api.ts)
ApiOperatorSkill, ApiSkillPreset, ApiOperatorSkillSummary, ApiAiMatchResult + 7 functions.

## App screens
- `app/(operator)/skills-setup.tsx` — full-screen first-login gate; chip picker from presets + free-form input; Save → PUT /operator-skills → router.replace dashboard
- `app/(admin)/skill-presets.tsx` — admin list/add/delete custom labels; entry via stats.tsx "Skill Labels" HubCard
- `app/(operator)/_layout.tsx` — added `skills-setup` as hidden tab (`href: null`); gate useEffect with useRef guard (runs once on mount, no render blocking)

## Activity wizard step 4 (activity-wizard.tsx)
- Replaced operators+avail state with operatorSkillsAll (ApiOperatorSkillSummary[])
- useEffect now loads getAllOperatorSkills() instead of getOperatorProfiles()+getCourseAvailability()
- Step 4: "Find Best Match (AI)" button → aiMatchOperator() → confidence-badged results at top; all operators below with skill chips
- Step 5: finds op via operatorSkillsAll.find(o => o.operator_profile_id === operatorProfileId), uses op.name not op.user?.name
- Removed unused compat() function and ApiCourseAvailTemplate import

**Why:** Skills-based matching is more semantically relevant than slot availability; AI provides ranked suggestions while manual fallback always available; skills_completed gate ensures new operators onboard before using the app.
