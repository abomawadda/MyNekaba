# Enterprise Design System - Phase 8

## Scope

Phase 8 establishes reusable UI primitives for the Arabic RTL ERP without redesigning modules or changing business logic.

## Tokens

- Typography: `Tajawal` with `Cairo` fallback.
- Brand: WE purple via `brand-*` tokens.
- Status tones: `success`, `warning`, `danger`, `info`, `neutral`, `brand`.
- Density: compact ERP spacing, 8-12px radius, subtle borders and shadows.
- RTL: components default to RTL; numeric and code values use `.num`, `.numeric`, `.financial-value`, `.phone-value`, `.code-value`.

## Components

- Actions: `Button`, `IconButton`.
- Forms: `FormField`, `Input`, `Select`, `Textarea`, `SearchInput`.
- Surfaces: `Card`, `Dialog`, `ConfirmDialog`.
- Feedback: `Alert`, `Skeleton`, `LoadingState`, `EmptyState`, `ErrorState`.
- Data: `DataTable`, `Pagination`, `Badge`, `StatusBadge`, `StatCard`.
- Navigation and page structure: `PageHeader`, `Breadcrumb`, `Toolbar`, `FilterBar`, `Tabs`.

## Usage Rules

- Keep module-specific decisions in modules. Components accept data, callbacks, and presentation props only.
- Do not put financial calculations, permission rules, or Firestore logic inside design-system components.
- Prefer `tone` and `variant` props over hard-coded colors.
- Use `IconButton` only when an accessible label is provided.
- Use `DataTable` as a view foundation only; sorting, filtering, and pagination state remain owned by the module.

## Print Safety

The design system does not add global print rules. Existing print templates remain isolated.

## Migration Notes

Existing module components should migrate gradually. Do not remove legacy local components until every usage is replaced and verified.
