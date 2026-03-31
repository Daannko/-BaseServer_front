# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Dev server on port 49191 (uses environment.ts, apiUrl: localhost:49192)
npm run build      # Production build → dist/base-server-app
npm run watch      # Build in watch mode (dev config)
npm run test       # Unit tests via Karma + Chrome
npm run serve:ssr:BaseServer-app  # Run SSR server from compiled dist
```

To run against a different backend, use the `dev` configuration which targets `localhost:8080`.

## Architecture

**BaseServer-app** is a collaborative canvas/board editor. Users manage "boards" containing "topics" (tiles) that can be repositioned, resized, connected with visual lines, and edited with a rich-text editor.

### Routing

Flat route structure in `src/app/app.routes.ts`:
- `/auth` — login/register
- `/` — home dashboard (protected by `authGuard`)
- `/board` — main canvas editor
- `/logout` — cleanup helper

`authGuard` calls `UserService.getUserData()` to validate the session before allowing access to `/`.

### Board Canvas (`src/app/pages/board/`)

The core feature. Key responsibilities are split across:

- **BoardComponent** — host element, loads board data, owns the canvas DOM
- **BoardMainService** — camera/viewport: pan (mouse drag), zoom (wheel), coordinate transforms between screen and world space, frustum culling via `isItemVisible()`. Applies CSS `scale(zoom) translate(-camX, -camY)` to the canvas.
- **BoardApiService** — REST calls for board/topic CRUD, exposes `boards$` and `topics$` as `BehaviorSubject`s
- **BoardTileComponent** — individual tile rendering; delegates movement to `TileMoveDirective`, resizing to `TileResizeDirective`, and rich text to `TiptapService`
- **BoardConnectorComponent** — SVG line between two tiles, updated via `updatePosition()` / `updateAngles()`

**Client-side data model:** `BoardTile` (in `board-tile.data.ts`) wraps the server `Topic` and tracks dirty flags (`positionUpdated`, `sizeUpdated`, `contentUpdated`, `nameUpdated`) so `BoardApiService.saveTopic()` can send delta-only PATCH requests.

### Rich Text

Tiptap 3 (ProseMirror-based). Tile `name` and `content` fields are stored as `JSONContent` (ProseMirror document JSON), not plain HTML. Rendering goes through `DomPurify` + custom sanitization in `rich-text.service.ts`. Custom extensions are in `src/app/helpers/tiptap/` and `board-tile/tiptap.extension.ts`.

### Auth & HTTP

- Cookie-based sessions; `HttpRequestInterceptor` (in `interceptors/refresh.interceptor.ts`) adds `withCredentials: true` to every request.
- On `401` the interceptor calls `AuthService.refresh()` and retries; on `462` it emits a `logout` event via `EventService` which `AppComponent` handles.
- `StorageService` wraps `sessionStorage` for user data and location.

### Navbar

`NavbarService.setTemplate(template, context)` lets any page inject arbitrary content into the shared navbar. Pages call this in `ngOnInit`.

### State & Reactivity

- `BehaviorSubject`s in services for shared reactive state; `async` pipe in templates.
- Cleanup pattern: `destroy$ = new Subject<void>()` + `takeUntil(this.destroy$)` in all components.
- Change detection: mostly default, with selective `ChangeDetectorRef.detectChanges()` in performance-sensitive board paths.

## Environment

`src/environments/environment.ts` is the default (dev, `apiUrl: localhost:49192`). `environment.prod.ts` targets the production API. The Tomorrow.io weather API key is also stored here.
