-- ---------------------------------------------------------------------------
-- The real portfolio, from highscore-tech-web.
--
-- Esther, 30 Oct: "it is more than four, they are different projects in
-- /portfolio", and "I did not see you use anything from highscore — that is
-- the demo they referred to."
--
-- Both right. The seed FILE in that repo holds four worked examples; its live
-- database holds TEN, and that is what /portfolio actually serves. The six I
-- had not seen are the real client work: My Poker, Dan Lami Real Estate,
-- PgHome, Nanogames, Earnest Mall, David Wej and Love Meet.
--
-- PUBLISHED STATE IS CARRIED ACROSS AS-IS, which reverses the caution in the
-- previous migration and should say why. I held the first four back because I
-- could not tell whether a seed file's client metrics were real. These are
-- not from a seed file. They are live on highscore's own site, so they are
-- claims the company already makes in public, and repeating them here is not
-- a new claim.
--
-- IMAGES STAY ON highscore's STORAGE. The URLs point at its public portfolio
-- bucket and resolve from anywhere, so nothing had to be re-uploaded and
-- rm-web still needs no bucket of its own. The cost is a dependency on that
-- bucket staying public — worth writing down, not worth blocking on.
--
-- Idempotent on slug: re-running refreshes the copy and the images.
-- ---------------------------------------------------------------------------

insert into portfolio_projects
  (slug, title, client, summary, body_md, tech_stack, category,
   cover_image_url, images, year, external_url, sort_order, published)
values
  ($hs$my-poker$hs$, $hs$My Poker$hs$, $hs$My Poker$hs$, $hs$MyPoker is a modern digital poker game designed to deliver an exciting, competitive, and easy-to-play poker experience. Players can enjoy strategic gameplay, compete against others, and experience the thrill of poker through a smooth and engaging digital platform.$hs$, $hs$##The problem
 Traditional poker games can feel complicated or difficult for new players to navigate, while many digital poker experiences lack a strong combination of engaging gameplay and social interaction. MyPoker was created to provide a more accessible, interactive, and enjoyable way for players to experience poker digitally.

##What we built
 A modern digital poker platform that:
— Enables players to enjoy poker through a simple and engaging interface.
 — Combines strategic gameplay with an interactive player experience.
 — Provides a visually appealing and easy-to-navigate gaming environment.
 — Creates opportunities for players to compete, interact, and enjoy the excitement of poker.

##Outcomes
_**Improved player engagement through interactive poker gameplay.
 _**A more accessible experience for both new and experienced players.
 _**A stronger digital identity that makes the game feel modern, competitive, and engaging.

##stack note
The platform is designed around a responsive gaming experience, with a focus on smooth gameplay, intuitive navigation, and scalable digital infrastructure. Its modular approach allows new features, game improvements, and player-focused experiences to be introduced while maintaining a consistent and engaging interface.$hs$,
   array[$hs$Supabase$hs$, $hs$PostgreSQL$hs$, $hs$Node.js$hs$], $hs$Software$hs$, $hs$https://ggijavqgshazbctkwmwl.supabase.co/storage/v1/object/public/portfolio/my-poker/b0e45549-35c7-4a49-a8bd-fdb66f7c11cb.webp$hs$, array[$hs$https://ggijavqgshazbctkwmwl.supabase.co/storage/v1/object/public/portfolio/my-poker/b0e45549-35c7-4a49-a8bd-fdb66f7c11cb.webp$hs$, $hs$https://ggijavqgshazbctkwmwl.supabase.co/storage/v1/object/public/portfolio/my-poker/5000e767-32ad-407e-8cc7-3aa426d8dcef.webp$hs$],
   2026, $hs$https://mypoker777.com/$hs$, 10, true),
  ($hs$dani-lami-real-estate$hs$, $hs$Dan Lami Real Estate$hs$, $hs$Dan Lami Real Estate$hs$, $hs$Dan Lami Real Estate
   A modern real estate brand focused on connecting client with quality properties and creating a stronger, more professional presence in the real estate market.$hs$, $hs$## The Problem

Dan Lami Real Estate needed a stronger digital presence that could properly showcase its properties and communicate trust, professionalism, and credibility to potential clients.

The existing presentation needed a more structured and modern approach to help visitors easily understand the brand and explore available real estate opportunities.

## What We Built

We created a professional digital experience focused on making property discovery simple and visually appealing.

### Key Features

- Modern real estate presentation
- Property showcase
- Clear service communication
- Responsive user experience
- Professional brand presentation
- Easy access to property information
- Client-focused navigation

## The Approach

The project focused on combining clean visual design with clear communication.

We structured the experience around:

- Property visibility
- Brand credibility
- Simple navigation
- Strong visual presentation
- Potential client engagement

## Outcomes

The new presentation provides Dan Lami Real Estate with:

- A stronger digital presence
- A more professional brand image
- Better property presentation
- Clearer communication with potential clients
- A more engaging experience for property seekers

## Stack Notes

- **Design:** Modern UI/UX
- **Frontend:** Responsive web interface
- **Content:** Property and real estate presentation
- **Focus:** Brand visibility, property discovery, and client engagement$hs$,
   array[$hs$React.js$hs$, $hs$Node.js$hs$, $hs$PostgreSQL$hs$, $hs$Github$hs$], $hs$Software$hs$, $hs$https://ggijavqgshazbctkwmwl.supabase.co/storage/v1/object/public/portfolio/dani-lami-real-estate/c4dd6a56-f111-4eed-9611-055d2e0ad555.webp$hs$, array[$hs$https://ggijavqgshazbctkwmwl.supabase.co/storage/v1/object/public/portfolio/dani-lami-real-estate/c4dd6a56-f111-4eed-9611-055d2e0ad555.webp$hs$],
   2026, $hs$https://danlamirealestate.com/$hs$, 10, true),
  ($hs$fintech-ai-support-copilot$hs$, $hs$AI support copilot for a fintech$hs$, $hs$Confidential fintech client$hs$, $hs$We built an AI copilot that drafts the first reply to every customer support ticket, cutting median response time from 18 minutes to under 90 seconds without sacrificing quality.$hs$, $hs$## The problem

The client's support team was being crushed by a 4× spike in ticket volume after a product launch. Hiring couldn't scale fast enough, and the quality of replies started to slip as agents triaged faster and faster.

## What we built

A retrieval-augmented copilot that sits inside the existing helpdesk. Each new ticket triggers a Supabase edge function that:

- Embeds the ticket using the OpenAI embeddings API.
- Retrieves the most relevant historical resolutions + product docs.
- Drafts a reply in the brand voice, tagged with the source documents.
- Surfaces the draft to the agent for one-click approval, edit, or send.

## Outcomes

- **Median first response time: 18 min → 87 seconds.**
- **Agent throughput up 2.4×** with the same headcount.
- **94% of drafted replies** are sent with zero or one-line edits.

## Stack notes

The retrieval index lives in **pgvector** alongside the rest of the data. We avoided introducing a separate vector DB to keep ops surface minimal and let RLS govern who sees what.$hs$,
   array[$hs$Next.js$hs$, $hs$Supabase$hs$, $hs$pgvector$hs$, $hs$OpenAI$hs$, $hs$TypeScript$hs$], $hs$AI$hs$, $hs$https://ggijavqgshazbctkwmwl.supabase.co/storage/v1/object/public/portfolio/fintech-ai-support-copilot/39aa0461-0bc9-4386-b379-8fc921d1baa9.webp$hs$, array[$hs$https://ggijavqgshazbctkwmwl.supabase.co/storage/v1/object/public/portfolio/fintech-ai-support-copilot/39aa0461-0bc9-4386-b379-8fc921d1baa9.webp$hs$, $hs$https://ggijavqgshazbctkwmwl.supabase.co/storage/v1/object/public/portfolio/fintech-ai-support-copilot/7dfb4a06-eb03-40a0-8336-28a507169274.webp$hs$],
   2026, $hs$https://nanogames.io$hs$, 10, true),
  ($hs$pg-home$hs$, $hs$Pghome$hs$, $hs$PgHome$hs$, $hs$PGHome (Golden Age Club) is a modern online gaming and rewards platform that combines slot-style entertainment with jackpots, challenges, and social features. Designed for a seamless mobile experience, it offers fast account management, live activity tracking, and engaging promotions that keep players coming back for new opportunities to play and win.$hs$, $hs$##The problem

PGHome wanted to deliver a premium gaming experience that combined fast-paced slot entertainment with community engagement and transparent rewards. The challenge was to provide seamless deposits, withdrawals, and live jackpot tracking while maintaining a smooth, mobile-first experience for a growing player base.

##What we built

A unified gaming platform that:

__ Features an extensive catalog of slot and instant-win games.
__ Delivers real-time jackpot updates, challenges, and promotional events.
__ Integrates secure wallet management for deposits and withdrawals.
__ Provides live transaction feeds, player support, and referral tools to foster community growth.

##Outcomes

_**Higher player retention driven by dynamic events and progressive jackpots.
_**Increased engagement through daily challenges and social features.
_**Improved operational efficiency with centralized wallet, support, and analytics systems.

##Stack notes

The platform leverages WebSockets for real-time updates, PostgreSQL for transactional integrity, and a scalable cloud infrastructure to support high concurrency. Modular services enable rapid deployment of new games, promotions, and player experiences while ensuring a secure and responsive environment.$hs$,
   array[$hs$Next.js$hs$, $hs$Node.js$hs$, $hs$postgreSQL$hs$], $hs$Software$hs$, $hs$https://ggijavqgshazbctkwmwl.supabase.co/storage/v1/object/public/portfolio/pg-home/9617b6af-225d-489e-ab67-56ba7c3de96d.webp$hs$, array[$hs$https://ggijavqgshazbctkwmwl.supabase.co/storage/v1/object/public/portfolio/pg-home/9617b6af-225d-489e-ab67-56ba7c3de96d.webp$hs$, $hs$https://ggijavqgshazbctkwmwl.supabase.co/storage/v1/object/public/portfolio/pg-home/49202190-e67e-41d9-8ff1-6763fce30984.webp$hs$, $hs$https://ggijavqgshazbctkwmwl.supabase.co/storage/v1/object/public/portfolio/pg-home/c01fe35e-3a5d-41ec-8e30-14be6b6dd321.webp$hs$],
   2026, $hs$https://pghome.co/$hs$, 10, true),
  ($hs$nano-games-io$hs$, $hs$Nanogames$hs$, $hs$Client Confidential$hs$, $hs$Nano Game.io is a fast-paced social gaming platform featuring bite-sized competitive mini-games, intelligent matchmaking, and rotating daily challenges. Built for instant fun and replayability, it delivers fair competition, real-time leaderboards, and fresh experiences that keep players coming back for “just one more match.”$hs$, $hs$##The problem

Nano Game.io wanted to keep players engaged across a growing catalog of mini-games while ensuring fair matchmaking and fresh content. Manual event scheduling and static queues made it difficult to maintain retention and provide a consistently fun experience as the player base expanded.

##What we built

A real-time game orchestration platform that:

— Tracks player skill, preferences, and recent activity.
— Dynamically recommends mini-games and assembles balanced matches.
—  Automatically rotates daily challenges and limited-time events.
— Provides live dashboards for monitoring retention, session length, and game balance.

##Outcomes

—** Day-7 retention increased by 31%.**
-**Average session duration grew by 22%.
—** Match abandonment decreased by 38%.

##Stack notes

Core services run on Supabase, with real-time updates powering lobbies and leaderboards. Player metrics are aggregated continuously, while configurable server-side rules enable rapid balancing and event deployment without requiring client update.$hs$,
   array[$hs$Supabase$hs$, $hs$Next.js$hs$, $hs$Node.js$hs$], $hs$Software$hs$, $hs$https://ggijavqgshazbctkwmwl.supabase.co/storage/v1/object/public/portfolio/nano-games-io/b037badb-2219-4f52-9e3e-88bb6d46db1a.webp$hs$, array[$hs$https://ggijavqgshazbctkwmwl.supabase.co/storage/v1/object/public/portfolio/nano-games-io/b037badb-2219-4f52-9e3e-88bb6d46db1a.webp$hs$, $hs$https://ggijavqgshazbctkwmwl.supabase.co/storage/v1/object/public/portfolio/nano-games-io/74751a99-1f7c-44a7-bab3-9181bb0f77cd.webp$hs$],
   2026, $hs$https://nanogames.io/$hs$, 10, true),
  ($hs$earnest-mall$hs$, $hs$Earnest Mall$hs$, $hs$Earnest mall$hs$, $hs$Earnest Mall is a modern e-commerce marketplace that connects shoppers with trusted sellers, offering a seamless experience for discovering, purchasing, and receiving quality products. With intuitive browsing, secure payments, and reliable order management, it makes online shopping convenient and enjoyable for both customers and merchants.$hs$, $hs$##The problem

Shoppers expected a fast, trustworthy online buying experience, while merchants needed simple tools to manage products, orders, and fulfillment. Existing solutions were often fragmented, resulting in abandoned carts, inefficient operations, and limited customer loyalty.

##What we built

A unified commerce platform that:

__ Provides intuitive product discovery with advanced search and filtering.
__ Enables secure checkout and multiple payment options.
__  Gives merchants real-time inventory, order, and fulfillment management tools.
__ Delivers automated notifications and shipment tracking for customers.

##Outcomes

_**Higher conversion rates through a streamlined checkout flow.
_**Reduced operational overhead with centralized merchant tools.
_** Improved customer satisfaction driven by transparency and timely updates.

##Stack notes

The platform is powered by Next.js on the frontend, with PostgreSQL and Supabase handling data, authentication, and storage. Payments are processed through Paystack, while analytics and monitoring provide actionable insights for continuous optimization.$hs$,
   array[$hs$Next.js$hs$, $hs$PostgreSQL$hs$, $hs$Supabase$hs$], $hs$Software$hs$, $hs$https://ggijavqgshazbctkwmwl.supabase.co/storage/v1/object/public/portfolio/earnest-mall/6908282a-aaaf-4529-aecd-604e3be064d3.webp$hs$, array[$hs$https://ggijavqgshazbctkwmwl.supabase.co/storage/v1/object/public/portfolio/earnest-mall/6908282a-aaaf-4529-aecd-604e3be064d3.webp$hs$, $hs$https://ggijavqgshazbctkwmwl.supabase.co/storage/v1/object/public/portfolio/earnest-mall/a8471d41-e9d5-4457-a1d0-1e4865cc9b24.webp$hs$, $hs$https://ggijavqgshazbctkwmwl.supabase.co/storage/v1/object/public/portfolio/earnest-mall/2aeceb28-855d-46f2-9d88-24b13053e9a5.webp$hs$],
   2026, $hs$https://earnestmall.com/$hs$, 10, true),
  ($hs$david-wej-lagos$hs$, $hs$David Wej$hs$, $hs$David Wej$hs$, $hs$David Wej Lagos is a premium hospitality and event destination in Lagos, offering stylish accommodations, versatile event spaces, and personalized service for business travelers, celebrations, and corporate gatherings. Blending contemporary comfort with warm hospitality, it provides an elegant setting for both short stays and memorable occasions.$hs$, $hs$##The problem

David Wej Lagos sought to translate its premium in-store fashion experience into a seamless digital journey. Customers needed an elegant way to discover collections, while the brand required streamlined inventory, merchandising, and order management to support growth across channels.

##What we built

A luxury e-commerce platform that:

__ Showcases seasonal collections with rich imagery and editorial storytelling.
__Delivers a frictionless shopping experience across mobile and desktop.
__ Integrates secure payments, inventory synchronization, and order tracking.
__ Enables the merchandising team to launch new arrivals and promotions with ease.

Outcomes

_**Higher online conversion rates through an elevated user experience.
_**Improved customer engagement with curated collections and personalized recommendations.
_**Greater operational efficiency via centralized product and fulfillment management.

##Stack notes

The storefront is powered by Next.js for speed and responsiveness, with Shopify managing catalog and commerce operations. Cloudflare ensures global performance, while analytics and customer engagement tools provide actionable insights for continuous optimization.$hs$,
   array[$hs$Next.js$hs$], $hs$Software$hs$, $hs$https://ggijavqgshazbctkwmwl.supabase.co/storage/v1/object/public/portfolio/david-wej-lagos/f4e2939e-d1b0-46a8-8228-27f453b23059.webp$hs$, array[$hs$https://ggijavqgshazbctkwmwl.supabase.co/storage/v1/object/public/portfolio/david-wej-lagos/f4e2939e-d1b0-46a8-8228-27f453b23059.webp$hs$, $hs$https://ggijavqgshazbctkwmwl.supabase.co/storage/v1/object/public/portfolio/david-wej-lagos/bb9d6237-758c-4d59-bf50-78853f5b1c70.webp$hs$],
   2026, $hs$https://ng.davidwej.com/$hs$, 10, true),
  ($hs$lovemeet$hs$, $hs$Love Meet$hs$, $hs$Love Meet$hs$, $hs$LoveMeet is a social platform where people can meet, chat, and build connections while playing fun interactive games together. It brings conversation and entertainment together, making every connection more engaging.$hs$, $hs$##The problem
Traditional social and dating platforms often separate meaningful connections from engaging experiences, leading to low retention and limited opportunities for users to interact naturally. LoveMeet App sought to create a space where people could build relationships while enjoying shared activities and earning rewards.

##What we built
A unified social platform that:

— Enables users to discover and connect with like-minded people.
— Incorporates interactive games and community activities to spark conversations.
__ Provides an affiliate program that rewards members for growing the community.
— Delivers a seamless mobile experience with real-time messaging and notifications.

##Outcomes

_**Higher user engagement through game-driven interactions.                                                                    _**Improved retention driven by recurring rewards and community events.
_**Organic growth fueled by the affiliate referral system.

##Stack notes

The application leverages real-time messaging, scalable cloud infrastructure, and analytics-driven personalization to deliver a secure, responsive experience. Modular services enable rapid deployment of new features and events while maintaining a consistent user experience.$hs$,
   array[$hs$Supabase$hs$, $hs$PostgreSQL$hs$, $hs$Node.js$hs$], $hs$Software$hs$, $hs$https://ggijavqgshazbctkwmwl.supabase.co/storage/v1/object/public/portfolio/lovemeet/7c0c4e0c-f51f-42d9-abee-d0080e758c84.webp$hs$, array[$hs$https://ggijavqgshazbctkwmwl.supabase.co/storage/v1/object/public/portfolio/lovemeet/7c0c4e0c-f51f-42d9-abee-d0080e758c84.webp$hs$],
   2026, $hs$https://lovemeetapp.com/$hs$, 10, true),
  ($hs$lagos-retail-mobile$hs$, $hs$Mobile commerce app for a Lagos retailer$hs$, $hs$Mensa Stores$hs$, $hs$A React Native shopping app with Paystack checkout, real-time inventory, and a delivery tracker — built in 10 weeks and live across iOS and Android.$hs$, $hs$
## Context

Mensa Stores wanted to move beyond Instagram orders and WhatsApp invoicing into a real mobile commerce experience. They wanted parity with the giants on the basics (search, checkout, tracking) without the bloat — and they wanted it live before their next peak season.

## What we shipped

- **Catalogue + search** powered by Postgres full-text search with category filters and saved searches.
- **Cart + checkout** with Paystack inline checkout (card, transfer, USSD).
- **Real-time inventory** so a sold-out item disappears from the listing the moment the last unit is paid for.
- **Delivery tracker** linked to the dispatch desk's WhatsApp status updates.
- **Push notifications** for order milestones — placed, packed, dispatched, delivered.

## Outcomes

- Cross-platform launch in **10 weeks** from kickoff.
- Conversion rate from product view → purchase **2.7× the Instagram funnel**.
- Returning-customer rate **doubled** within the first 90 days.

## Stack notes

The same Supabase backend serves the staff admin tool (a separate Next.js app) and the mobile clients. One schema, two clients, fewer surprises.
  $hs$,
   array[$hs$React Native$hs$, $hs$Expo$hs$, $hs$Supabase$hs$, $hs$Paystack$hs$, $hs$TypeScript$hs$], $hs$Mobile$hs$, null, array[]::text[],
   2025, null, 20, true),
  ($hs$school-management-platform$hs$, $hs$School management platform$hs$, $hs$Brightway Schools$hs$, $hs$We replaced a tangle of spreadsheets with a single platform handling student records, fee billing, attendance, and parent communication for a 1,400-student private school.$hs$, $hs$
## What it covers

- **Student records** — every learner has a single profile that follows them from intake to graduation.
- **Fees + billing** — termly invoices, partial payments, automatic receipts, and a dashboard the bursar can read at 7am with one eye open.
- **Attendance** — class teachers mark from any device; parents see live status.
- **Parent portal** — academic progress, fee status, and a direct line to the form teacher.

## Why it mattered

The school previously ran on a chain of spreadsheets, WhatsApp groups, and three different finance apps. Errors compounded: a child's fees would show paid in one place and unpaid in another. The single source of truth was nobody.

We collapsed the operations into a single platform with proper roles and audit. The bursar's monthly reconciliation went from **two full days to ninety minutes**.

## Stack notes

Built on Next.js + Supabase. The reporting layer uses **server actions + PDF generation** rather than a separate reporting service — fewer moving parts for a small IT team to maintain.
  $hs$,
   array[$hs$Next.js$hs$, $hs$Supabase$hs$, $hs$PostgreSQL$hs$, $hs$Tailwind$hs$, $hs$PDF generation$hs$], $hs$Software$hs$, null, array[]::text[],
   2025, null, 30, true)
on conflict (slug) do update set
  title           = excluded.title,
  client          = excluded.client,
  summary         = excluded.summary,
  body_md         = excluded.body_md,
  tech_stack      = excluded.tech_stack,
  category        = excluded.category,
  cover_image_url = excluded.cover_image_url,
  images          = excluded.images,
  year            = excluded.year,
  external_url    = excluded.external_url,
  sort_order      = excluded.sort_order,
  published       = excluded.published,
  updated_at      = now();

do $$
declare
  n integer;
  p integer;
begin
  select count(*), count(*) filter (where published) into n, p
    from portfolio_projects;
  raise notice '% portfolio project(s), % published.', n, p;
end$$;
