#!/usr/bin/env python3
"""
Populate HA config files from my-config.yaml.
Run via setup.sh, not directly (it handles decryption).

Loop markers in source files:
  # __LOOP_PERSONS_START__  ... # __LOOP_PERSONS_END__
    → block is repeated once per family member, with per-person substitutions applied.

Per-person substitutions inside a loop block:
  person1_     → {slug}_
  -person1-    → -{slug}-
  Person1      → display_name
  __PERSON_1__ → person_entity
  __CAL_1__    → calendar_entity
  __CAL_1_ONCALL__ → on_call_calendar (line only emitted if on_call_calendar set)
  __COLOR_1__  → color
  __GROCY_ID_1__ → grocy_user_id
  CAL1         → CAL{n}  (for week/month planner JS variables)
  'person1'    → '{slug}'  (for YAML/JS string values)

Conditional line prefixes inside a loop block:
  #ONCALL:    → include this line (strip prefix) only if person has on_call_calendar
  #PRESENCE:  → include this line (strip prefix) only if person has hide_when_away: true

Global markers (outside loop blocks):
  ##PERSON_STYLE_TERNARY##   → JS ternary chain for bubble-card background
  ##PERSON_RETURN_TERNARY##  → JS if-return chain for button-card color
"""
import os
import sys
import re

try:
    import yaml
except ImportError:
    print("Error: pyyaml not found. Install with: pip3 install pyyaml")
    sys.exit(1)

DEFAULT_COLORS = [
    "#fb8072", "#fdbf6f", "#a6cee3", "#cab2d6",
    "#b2df8a", "#ff7f00", "#e31a1c", "#6a3d9a",
]

with open("my-config.yaml") as f:
    cfg = yaml.safe_load(f)

members = cfg["family"]["members"]
c = cfg["calendars"]
mealie = cfg["mealie"]
weather = cfg.get("weather", {})

member_list = list(members.values())

# Assign colors from config or default palette
for i, member in enumerate(member_list):
    if "color" not in member:
        member["color"] = DEFAULT_COLORS[i % len(DEFAULT_COLORS)]

# Find the presence-tracked member (hide_when_away: true)
presence_member = next(
    (m for m in member_list if m.get("hide_when_away")),
    None,
)


def expand_for_person(template, n, member):
    """Apply per-person token substitutions to a loop block."""
    slug = member["slug"]
    name = member["display_name"]
    has_oncall = bool(member.get("on_call_calendar"))
    has_presence = bool(member.get("hide_when_away"))
    color = member["color"]
    grocy_id = str(member.get("grocy_user_id", ""))

    lines_out = []
    for line in template.splitlines(keepends=True):
        # Handle conditional prefixes
        stripped = line.lstrip()
        leading_ws = line[: len(line) - len(stripped)]

        if stripped.startswith("#ONCALL:"):
            if not has_oncall:
                continue
            line = leading_ws + stripped[len("#ONCALL:"):].lstrip("\n")
            if not line.endswith("\n"):
                line += "\n"

        elif stripped.startswith("#PRESENCE:"):
            if not has_presence:
                continue
            line = leading_ws + stripped[len("#PRESENCE:"):].lstrip("\n")
            if not line.endswith("\n"):
                line += "\n"

        # Apply token substitutions
        line = line.replace(f"person1_", f"{slug}_")
        line = line.replace(f"-person1-", f"-{slug}-")
        line = line.replace(f"person1-", f"{slug}-")
        line = line.replace(f"'person1'", f"'{slug}'")
        line = line.replace(f"Person1", name)
        line = line.replace(f"__PERSON_1__", member["person_entity"])
        line = line.replace(f"__CAL_1__", member["calendar_entity"])
        if has_oncall:
            line = line.replace(f"__CAL_1_ONCALL__", member["on_call_calendar"])
        line = line.replace(f"__COLOR_1__", color)
        line = line.replace(f"__GROCY_ID_1__", grocy_id)
        # CAL1 → CAL{n} (positional JS variable names)
        line = line.replace(f"CAL1", f"CAL{n}")
        # presence boolean entity references
        line = line.replace(f"PERSON1CAL", f"{slug.upper()}CAL")
        line = line.replace(f"person1_home_today", f"{slug}_home_today")
        line = line.replace(f"person1_home", f"{slug}_home")

        lines_out.append(line)

    return "".join(lines_out)


def expand_person_blocks(content, members_dict):
    """
    Find all # __LOOP_PERSONS_START__ / # __LOOP_PERSONS_END__ blocks and
    expand them, repeating once per member with per-person substitutions.

    The START and END marker lines (including their leading whitespace) are
    consumed and not included in the output.
    """
    START = "# __LOOP_PERSONS_START__"
    END = "# __LOOP_PERSONS_END__"

    lines = content.splitlines(keepends=True)
    result = []
    i = 0

    while i < len(lines):
        line = lines[i]
        if line.strip() == START:
            # Collect the block lines until END
            block_lines = []
            i += 1
            while i < len(lines):
                if lines[i].strip() == END:
                    i += 1
                    break
                block_lines.append(lines[i])
                i += 1
            else:
                raise ValueError("Found __LOOP_PERSONS_START__ without matching __LOOP_PERSONS_END__")

            # Remove single trailing newline from block if present (END eats its line)
            block = "".join(block_lines)
            if block.endswith("\n"):
                block = block[:-1]

            for n, member in enumerate(members_dict.values(), 1):
                expanded = expand_for_person(block, n, member)
                if expanded and not expanded.endswith("\n"):
                    expanded += "\n"
                result.append(expanded)
        else:
            result.append(line)
            i += 1

    return "".join(result)


def make_style_ternary(members_dict):
    """
    Generate the JS ternary chain for bubble-card background color.
    ${state == 'Name1' ? 'var(--slug1-...)' : state == 'Name2' ? ... : 'gray'}
    """
    parts = []
    state_expr = "hass.states['input_select.calendar_select'].state"
    for member in members_dict.values():
        name = member["display_name"]
        slug = member["slug"]
        parts.append(
            f"{state_expr} == '{name}' ? 'var(--{slug}-default-primary-color)'"
        )
    # Add Family
    parts.append(
        f"{state_expr} == 'Family' ? 'var(--family-default-primary-color)'"
    )
    parts.append("'gray'")

    ternary = " : ".join(parts)
    return f"${{{ternary}}}"


def make_return_ternary(members_dict):
    """
    Generate JS if-return statements for button-card color (single line to avoid YAML block scalar indentation issues).
    """
    parts = []
    for member in members_dict.values():
        name = member["display_name"]
        slug = member["slug"]
        parts.append(
            f"if (states['input_select.calendar_select'].state == '{name}') "
            f"return \"var(--{slug}-default-primary-color)\";"
        )
    return " ".join(parts)


# ---------------------------------------------------------------------------
# Build global substitutions
# ---------------------------------------------------------------------------
substitutions = {}

# Shared calendars
substitutions["__CAL_FAMILY__"]     = c["family_display"]
substitutions["__CAL_FAMILY_ADD__"] = c["family_add"]
substitutions["__CAL_FRIENDS__"]    = c.get("friends", "")
substitutions["__CAL_SEAHAWKS__"]   = c.get("seahawks", "")
substitutions["__CAL_HOLIDAYS__"]   = c["holidays"]

# Weather
substitutions["__WEATHER_FORECAST__"] = weather.get("forecast_entity", "weather.openweathermap")

# Mealie
substitutions["__MEALIE_URL__"]       = mealie["url"]
substitutions["__MEALIE_TOKEN__"]     = mealie["api_token"]
substitutions["__MEALIE_CONFIG_ID__"] = mealie["config_entry_id"]

# Inline slug list used in chores.yaml script field description
slug_list = ", ".join(m["slug"] for m in member_list)
substitutions["person1, person2, person3, person4"] = slug_list

# Presence member globals
if presence_member:
    substitutions["__PRESENCE_SLUG__"]          = presence_member["slug"]
    substitutions["__PRESENCE_NAME__"]          = presence_member["display_name"]
    substitutions["__PRESENCE_PERSON_ENTITY__"] = presence_member["person_entity"]
else:
    substitutions["__PRESENCE_SLUG__"]          = "unknown"
    substitutions["__PRESENCE_NAME__"]          = "Unknown"
    substitutions["__PRESENCE_PERSON_ENTITY__"] = "person.unknown"

# JS ternary markers
substitutions["##PERSON_STYLE_TERNARY##"]  = make_style_ternary(members)
substitutions["##PERSON_RETURN_TERNARY##"] = make_return_ternary(members)

# ---------------------------------------------------------------------------
# Source files to process
# ---------------------------------------------------------------------------
SOURCE_FILES = [
    "dashboard.yaml",
    "packages/calendar.yaml",
    "packages/chores.yaml",
    "packages/mealie.yaml",
    "themes/skylight.yaml",
]

os.makedirs("_deploy/packages", exist_ok=True)
os.makedirs("_deploy/themes", exist_ok=True)

# Generate secrets.yaml for HA /config/secrets.yaml
secrets = (
    f"mealie_url: {mealie['url']}\n"
    f"mealie_config_entry_id: {mealie['config_entry_id']}\n"
)
with open("_deploy/secrets.yaml", "w") as f:
    f.write(secrets)
print("Generated: _deploy/secrets.yaml")

# Process each source file
for src in SOURCE_FILES:
    with open(src) as f:
        content = f.read()

    # Step 1: Expand loop blocks
    content = expand_person_blocks(content, members)

    # Step 2: Apply global substitutions
    for placeholder, value in substitutions.items():
        content = content.replace(placeholder, str(value))

    out = os.path.join("_deploy", src)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w") as f:
        f.write(content)
    print(f"Generated: {out}")

print("\nDone! Copy _deploy/ contents to your HA /config/ directory:")
print("  _deploy/secrets.yaml        → /config/secrets.yaml  (merge, don't overwrite)")
print("  _deploy/dashboard.yaml      → paste into Lovelace raw YAML editor")
print("  _deploy/packages/           → /config/packages/")
print("  _deploy/themes/             → /config/themes/")
