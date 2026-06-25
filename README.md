# Family Dashboard

A Home Assistant dashboard with a family calendar, chore tracker, meal plan, and shopping list.

![Dashboard](assets/main_view.jpeg)

---

## What's in this repo

| File | Purpose |
|---|---|
| `my-config.example.yaml` | Template config — copy to `my-config.yaml` and fill in your values |
| `setup.sh` | Generates populated HA files in `_deploy/` from your config |
| `setup.py` | Called by `setup.sh` — does the actual substitution |
| `dashboard.yaml` | Lovelace dashboard template (placeholders filled by `setup.sh`) |
| `packages/calendar.yaml` | Calendar helpers, filter scripts, and "Add Event" logic |
| `packages/chores.yaml` | Grocy chore sensors, point tracking, and daily resets |
| `packages/mealie.yaml` | Mealie meal plan sensors and scripts |
| `themes/skylight.yaml` | Optional theme (Skylight-style fonts and colors) |
| `www/mealie-meal-plan-card.js` | Custom card: weekly meal plan view |
| `www/mealie-shopping-list-card.js` | Custom card: interactive shopping list (desktop) |
| `www/mealie-shopping-mobile-card.js` | Custom card: mobile-optimized shopping list for in-store use |

---

## Quickstart

```bash
# 1. Copy the example config and fill in your values
cp my-config.example.yaml my-config.yaml
# edit my-config.yaml — see "Filling in my-config.yaml" below

# 2. Generate your HA files
./setup.sh

# 3. Deploy
#   _deploy/secrets.yaml    → merge into /config/secrets.yaml
#   _deploy/packages/       → copy to /config/packages/
#   _deploy/themes/         → copy to /config/themes/
#   _deploy/dashboard.yaml  → paste into Lovelace raw YAML editor
```

`my-config.yaml` is gitignored. To keep your real values in the repo securely, see [Keeping your config in the repo](#keeping-your-config-in-the-repo-optional).

---

## Dashboard views

The dashboard has four views (tabs):

| View | Path | Contents |
|---|---|---|
| Calendar | `family-calendar` | Weather, filter buttons, Today / Tomorrow / Week / Month calendar |
| Chores | `chores` | Per-person chore lists and weekly/monthly point totals |
| Meal Plan | `meal-plan` | Weekly meal plan via Mealie |
| Shopping | `shopping-list` | Interactive shopping list via Mealie |

---

## Requirements

Before running setup, make sure you have the following in place:

**Home Assistant**
- Home Assistant instance (any install method)
- HACS installed (for frontend cards)
- Lovelace Sections view support (HA 2024.1+)
- Packages enabled in `/config/configuration.yaml` (see [HA Packages](#4-ha-packages))

**Integrations** — install from **Settings > Devices & Services > Add Integration**
- **Google Calendar** — one account per family member
- **OpenWeatherMap** — current conditions card at the top of the dashboard
- **Holiday** — US holiday calendar (select your country/region)
- **Grocy** — chore list and point tracking
- **Mealie** — meal planning and shopping list

**Person entities**
- A `person.*` entity in HA for each family member (used for presence detection and calendar filtering)

**Grocy chore conventions**
- Each chore assigned to the correct Grocy user
- Period type set to `daily` or `weekly` (with the day name in the period config)
- Description set to a number — this becomes the point value (e.g., `10` = 10 points)

---

## Filling in my-config.yaml

`my-config.yaml` is the single place you customize this dashboard. Everything else is generated from it.

```yaml
family:
  members:
    person1:
      display_name: Alex        # name shown in dashboard labels and cards
      slug: alex                # lowercase, no spaces — becomes part of HA entity IDs
                                # e.g. input_text.alex_calendar_filter
      person_entity: person.alex
      calendar_entity: calendar.alex_gmail_com
      grocy_user_id: 1          # find in Grocy > Admin Panel > Manage Users
      color: "#fb8072"          # hex color for this person's calendar events and chore card
                                # default palette: #fb8072 #fdbf6f #a6cee3 #cab2d6 #b2df8a #ff7f00 #e31a1c #6a3d9a
      on_call_calendar: calendar.alex_work_oncall  # optional — remove if unused
      hide_when_away: true      # optional — hides chore list when person is not home

    person2:
      display_name: Jordan
      slug: jordan
      # ... same fields as above

    # add as many people as you need

calendars:
  family_display: calendar.family_calendar   # shown in week/month planner view
  family_add: calendar.family                # target when adding new events
  friends: calendar.friend_events            # optional
  seahawks: calendar.your_sports_team        # optional
  holidays: calendar.united_states_va        # from the HA Holiday integration

weather:
  forecast_entity: weather.openweathermap    # entity for the hourly forecast card

mealie:
  url: mealie.yourdomain.com
  api_token: YOUR_MEALIE_TOKEN
  config_entry_id: YOUR_MEALIE_CONFIG_ENTRY_ID

grocy:
  url: grocy.yourdomain.com

home_assistant:
  url: home.yourdomain.com
  long_lived_token: YOUR_HA_TOKEN
```

**Finding your values:**

| Field | Where to find it |
|---|---|
| `person_entity` | **Settings > People** — the entity ID shown under each person |
| `calendar_entity` | **Developer Tools > States** — filter by `calendar.` |
| `on_call_calendar` | Same as above — only needed if someone has an on-call work calendar |
| `grocy_user_id` | Grocy **Admin Panel > Manage Users** — the ID column |
| `color` | Any hex color — controls the person's filter button, calendar color, and chore card background |
| `hide_when_away` | Set to `true` for anyone who splits time between households — hides their chore list when their `person.*` entity shows `not_home` |
| `weather.forecast_entity` | **Developer Tools > States** — filter by `weather.` to find your hourly forecast entity |
| `mealie.url` | Your Mealie instance URL (no `https://`) |
| `mealie.api_token` | Mealie **User Profile > API Tokens** — create a long-lived token |
| `mealie.config_entry_id` | **Settings > Devices & Services > Mealie** — the ID in the page URL after `/config_entries/` |

---

## Setup

### 1. HA Integrations

Install from **Settings > Devices & Services > Add Integration**:

| Integration | Why |
|---|---|
| **Google Calendar** | Pulls in each family member's Google calendar |
| **OpenWeatherMap** | Powers the current conditions card |
| **Holiday** | US holiday calendar |
| **Grocy** | Chore list and point tracking |
| **Mealie** | Meal planning and shopping list |

After adding Google Calendar, HA will create `calendar.*` entities based on your account names. Note these entity IDs — you'll put them in `my-config.yaml`.

---

### 2. HACS Frontend Cards

Install from **HACS > Frontend**:

- `week-planner-card`
- `bubble-card`
- `config-template-card`
- `card-mod`
- `better-moment-card`
- `weather-card`
- `atomic-calendar-revive`
- `auto-entities`
- `button-card`
- `browser_mod`

---

### 3. Fill in my-config.yaml and run setup

```bash
cp my-config.example.yaml my-config.yaml
# edit my-config.yaml with your entity IDs, names, and tokens
./setup.sh
```

`setup.sh` will auto-install `pyyaml` if it's missing, then generate a `_deploy/` directory with ready-to-use HA files.

---

### 4. HA Packages

Enable packages in `/config/configuration.yaml` if not already set:

```yaml
homeassistant:
  packages: !include_dir_named packages
```

Copy the package files from `_deploy/packages/` into `/config/packages/`:

- `packages/calendar.yaml`
- `packages/chores.yaml`
- `packages/mealie.yaml`

Restart Home Assistant.

---

### 5. Secrets

Merge the generated secrets into your `/config/secrets.yaml`:

```yaml
# from _deploy/secrets.yaml:
mealie_url: your-mealie-url
mealie_config_entry_id: your-config-entry-id
```

Don't overwrite your entire `secrets.yaml` — append or merge these two keys.

---

### 6. Custom Cards

#### Upload the JS files to HA

The JS files need to be in `/config/www/` on your HA instance. How you get them there depends on your setup:

**Option A — File Editor add-on** (easiest)
1. Install the **File Editor** add-on from **Settings > Add-ons > Add-on Store**
2. Open File Editor and navigate to `www/` (create the folder if it doesn't exist)
3. Click the upload icon and upload each JS file from the `www/` folder in this repo

**Option B — Studio Code Server add-on**
1. Install **Studio Code Server** from the add-on store
2. Open it and drag the JS files into the `www/` folder in the file tree

**Option C — SSH / Terminal add-on**
```bash
# From your HA terminal, copy files from wherever you've placed this repo
cp /path/to/repo/www/*.js /config/www/
```

**Option D — Samba / network share**
- Enable the **Samba** add-on, connect to your HA share, and copy the files into the `www` folder

---

#### Register as Lovelace resources

After uploading, register the files at **Settings > Dashboards > Resources**:

| URL | Type |
|---|---|
| `/local/mealie-meal-plan-card.js` | JavaScript Module |
| `/local/mealie-shopping-list-card.js` | JavaScript Module |
| `/local/mealie-shopping-mobile-card.js` | JavaScript Module |

---

### 7. Grocy Chores Setup

The chores package reads from `sensor.grocy_chores` and maps chores to family members by Grocy user ID. The `grocy_user_id` values in `my-config.yaml` must match the IDs in your Grocy instance (**Admin Panel > Manage Users**).

When creating chores in Grocy:
- **Assign** the chore to the correct user(s)
- **Schedule** as `daily` or `weekly` with the day name in the period config
- **Set the description** to a number — this is the point value

If a family member has `hide_when_away: true` in their config, their chore list will be hidden when their `person.*` entity shows `not_home` at midnight.

---

### 8. Dashboard

1. Create a new dashboard in **Settings > Dashboards**. Set the view type to **Sections**.
2. Open the raw YAML editor (three-dot menu > Edit Dashboard > Raw Configuration Editor).
3. Paste the contents of `_deploy/dashboard.yaml`.
4. Save and reload.

The dashboard has four views — use the tabs to switch between Calendar, Chores, Meal Plan, and Shopping.

---

### 9. Theme (optional)

1. Add to `/config/configuration.yaml`:
   ```yaml
   frontend:
     themes: !include_dir_merge_named themes
   ```
2. Copy `_deploy/themes/skylight.yaml` to `/config/themes/`.
3. Restart HA.
4. Go to your profile and select the **Skylight** theme.

---

## Keeping your config in the repo (optional)

`my-config.yaml` is gitignored by default. If you want your real values version-controlled but private, encrypt the file with [SOPS](https://github.com/getsops/sops) + [Age](https://github.com/FiloSottile/age):

```bash
# Install (one time)
brew install sops age

# Generate a keypair
# Back up ~/.config/sops/age/keys.txt somewhere safe — losing it means losing access
age-keygen -o ~/.config/sops/age/keys.txt

# Update .sops.yaml with your public key (replace the age: line)

# Encrypt
sops -e my-config.yaml > my-config.enc.yaml

# Edit the encrypted file in place later
sops my-config.enc.yaml

# setup.sh auto-detects my-config.enc.yaml when my-config.yaml is absent
./setup.sh
```

---

## How the calendar filters work

Each person has an `input_text` entity that holds a regex. The filter buttons on the dashboard toggle it between `.*` (show) and `^$` (hide). The `config-template-card` injects these into the `week-planner-card` at render time, so toggling a person's button instantly hides or shows their events.
