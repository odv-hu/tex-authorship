-- authorship.lua -- Lua side of authorship.sty (LuaLaTeX only)
-- MIT licence, https://github.com/odv-hu/tex-authorship

local M = {}

local attr            -- attribute register number, set by init()
local gradient = false
local UNSET = -0x7FFFFFFF

local GLYPH = node.id("glyph")
local RULE  = node.id("rule")
local HLIST = node.id("hlist")
local VLIST = node.id("vlist")
local get_attribute = node.get_attribute

-- Default colours by kind, RGB 0..1. Your own text is never touched.
local kind_colour = {
  ai        = {0.88, 0.07, 0.50},   -- punchy magenta
  human     = {0.15, 0.40, 0.85},   -- blue
  reference = {0.50, 0.50, 0.50},   -- grey
}
local prefix_kind = { ["@"] = "human", ["&"] = "ai", ["*"] = "reference" }
-- Gradient stops for AI text (cycled along each passage).
local gradient_stops = {
  {0.90, 0.08, 0.52},  -- magenta
  {0.98, 0.42, 0.10},  -- orange
  {0.55, 0.20, 0.95},  -- violet
}
local GRADIENT_PERIOD = 240   -- glyphs per full cycle
local GRADIENT_STEP   = 3     -- glyphs that share one colour step

local colour_overrides = {}   -- label / key / kind -> {r,g,b}
local authors = {}            -- key -> {key, kind, label, count}
local author_order = {}
local instances = {}          -- attribute value -> {author, n}
local stack = {}

----------------------------------------------------------------------
-- helpers

local function to_hex(s)
  return (s:gsub(".", function(c) return string.format("%02x", c:byte()) end))
end

local function from_hex(h)
  return (h:gsub("%x%x", function(x) return string.char(tonumber(x, 16)) end))
end

local function warn(msg)
  texio.write_nl("term and log", "Package authorship Warning: " .. msg)
  texio.write_nl("term and log", "")
end

local function author(key)
  local a = authors[key]
  if not a then
    local prefix, label = key:sub(1, 1), key:sub(2)
    a = { key = key, kind = prefix_kind[prefix] or "human", label = label, count = 0 }
    authors[key] = a
    author_order[#author_order + 1] = key
  end
  return a
end

local function colour_of_author(a)
  return colour_overrides[a.key] or colour_overrides[a.label] or colour_overrides[a.kind]
      or kind_colour[a.kind]
end

local function lerp(c1, c2, t)
  return { c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t, c1[3] + (c2[3] - c1[3]) * t }
end

local function gradient_colour(i)
  local n = #gradient_stops
  local pos = ((i % GRADIENT_PERIOD) / GRADIENT_PERIOD) * n
  local k = math.floor(pos)
  return lerp(gradient_stops[k + 1], gradient_stops[(k + 1) % n + 1], pos - k)
end

local function pdf_colour(c)
  return string.format("%.3f %.3f %.3f rg %.3f %.3f %.3f RG", c[1], c[2], c[3], c[1], c[2], c[3])
end

local function push(c)
  local n = node.new("whatsit", "pdf_colorstack")
  n.stack, n.command, n.data = 0, 1, pdf_colour(c)
  return n
end

local function pop()
  local n = node.new("whatsit", "pdf_colorstack")
  n.stack, n.command, n.data = 0, 2, ""
  return n
end

----------------------------------------------------------------------
-- reading: turn marker comment lines into \AuthorshipOpen / \AuthorshipClose

local function rewrite_line(line)
  local close, prefix, label = line:match("^%s*%%%[(/?)([@&%*])([^%]]+)%]%s*$")
  if not prefix then return nil end
  label = label:gsub("^%s+", ""):gsub("%s+$", "")
  local cs = close == "/" and "\\AuthorshipClose" or "\\AuthorshipOpen"
  -- hex keeps any character in the label safe from TeX; the final % swallows the line end,
  -- exactly like the comment line it replaces
  return cs .. "{" .. to_hex(prefix .. label) .. "}%"
end

----------------------------------------------------------------------
-- typesetting: track the current author in an attribute

local function set_current()
  local top = stack[#stack]
  tex.setattribute("global", attr, top or UNSET)
end

function M.open(hex)
  local a = author(from_hex(hex))
  local id = #instances + 1
  instances[id] = { author = a, n = 0 }
  stack[#stack + 1] = id
  set_current()
end

function M.close(hex)
  local key = from_hex(hex)
  for i = #stack, 1, -1 do
    if instances[stack[i]].author.key == key then
      for j = #stack, i, -1 do stack[j] = nil end
      set_current()
      return
    end
  end
  warn("closing marker %[/" .. key .. "] has no matching opening marker")
end

----------------------------------------------------------------------
-- shipout: colour every glyph (and rule) carrying the attribute, and count
-- characters and words per author

local DISC = node.id("disc")
local GLUE = node.id("glue")
local EXCLUDED = 0x7FFFFF00     -- attribute value for text left out of the counts (the summary itself)

local stats = {}                -- key ("Mine" or author key) -> {chars, words}
local function stats_for(key)
  local s = stats[key]
  if not s then s = { chars = 0, words = 0 }; stats[key] = s end
  return s
end

-- Word state. A word is a run of glyphs between spaces; it counts once, for the author
-- of its first letter or digit. Runs of punctuation alone are not words.
local in_word, word_counted = false, false
local carry, carry_counted = false, false   -- a line ended in a hyphen: the word continues

local function end_word() in_word, word_counted = false, false end

local function wordish(ch)
  return ch and ((ch >= 48 and ch <= 57) or (ch >= 65 and ch <= 90) or (ch >= 97 and ch <= 122) or ch >= 0xC0)
end

local function count_glyph(n, key)
  local s = stats_for(key)
  local chars = 0
  if n.components then for _ in node.traverse_id(GLYPH, n.components) do chars = chars + 1 end end
  s.chars = s.chars + math.max(chars, 1)        -- a ligature like "fi" counts as two
  in_word = true
  if not word_counted and wordish(n.char) then
    s.words = s.words + 1
    word_counted = true
  end
end

local function colour_for(n)
  local id = get_attribute(n, attr)
  if id == EXCLUDED then
    if n.id == GLYPH then end_word() end
    return nil
  end
  local inst = id and instances[id]
  if not inst then
    if n.id == GLYPH then count_glyph(n, "Mine") end
    return nil
  end
  local a = inst.author
  if n.id == GLYPH then count_glyph(n, a.key) end
  if gradient and a.kind == "ai" and not (colour_overrides[a.key] or colour_overrides[a.label]) then
    local step = math.floor(inst.n / GRADIENT_STEP)
    inst.n = inst.n + 1
    return id .. ":" .. step, gradient_colour(step * GRADIENT_STEP)
  end
  return a.key, colour_of_author(a)
end

local function process(head)
  local current = nil
  local last_content = nil      -- id of the last glyph/disc/box/rule, to spot lines ending in a hyphen
  local n = head
  while n do
    local id = n.id
    if id == GLYPH or id == RULE then
      local key, c = colour_for(n)
      if id == RULE then end_word() end
      if key ~= current then
        if current then head = node.insert_before(head, n, pop()) end
        if key then head = node.insert_before(head, n, push(c)) end
        current = key
      end
      last_content = id
    elseif id == GLUE then
      end_word()
    elseif id == DISC then
      carry_counted = word_counted
      last_content = id
    elseif id == HLIST or id == VLIST then
      if current then head = node.insert_before(head, n, pop()); current = nil end
      if carry then in_word, word_counted, carry = true, carry_counted, false else end_word() end
      if n.head then n.head = process(n.head) end
      last_content = id
    end
    n = n.next
  end
  if current then node.insert_after(head, node.tail(head), pop()) end
  if last_content == DISC then carry = true end
  return head
end

----------------------------------------------------------------------
-- summary

local function summary_string()
  local parts = {}
  local mine = stats_for("Mine")
  parts[1] = "Mine=" .. mine.chars .. "," .. mine.words
  for _, key in ipairs(author_order) do
    local s = stats[key]
    if s and s.chars > 0 then parts[#parts + 1] = key .. "=" .. s.chars .. "," .. s.words end
  end
  return table.concat(parts, "|")
end

function M.finish()
  if #stack > 0 then
    warn("marker %[" .. instances[stack[#stack]].author.key .. "] is never closed")
  end
  local s = summary_string()
  texio.write_nl("term and log", "authorship: characters,words per author: " .. (s:gsub("|", "; ")))
  texio.write_nl("term and log", "")
  tex.sprint("\\AuthorshipWriteAux{")
  tex.sprint(-2, s)
  tex.sprint("}")
end

local function group_digits(n)
  local s = tostring(n)
  local out = s:reverse():gsub("(%d%d%d)", "%1,"):reverse()
  return (out:gsub("^,", ""))
end

-- A small framed colour square for the summary table, like a legend key.
-- Your own text gets solid black; AI text in gradient mode gets the gradient in bands.
local SWATCH_BANDS = 9
local function rgb_string(c) return string.format("%.3f %.3f %.3f", c[1], c[2], c[3]) end

local function uses_gradient(a)
  return gradient and a.kind == "ai" and not (colour_overrides[a.key] or colour_overrides[a.label])
end

local function swatch(key)
  local bands = {}
  if key == "Mine" then
    bands[1] = "\\AuthorshipBand{1}{0 0 0}"
  else
    local a = author(key)
    if uses_gradient(a) then
      for i = 0, SWATCH_BANDS - 1 do
        local c = gradient_colour(math.floor(i * GRADIENT_PERIOD / SWATCH_BANDS))
        bands[#bands + 1] = string.format("\\AuthorshipBand{%.4f}{%s}", 1 / SWATCH_BANDS, rgb_string(c))
      end
    else
      bands[1] = "\\AuthorshipBand{1}{" .. rgb_string(colour_of_author(a)) .. "}"
    end
  end
  return "\\AuthorshipSwatchBox{" .. table.concat(bands) .. "}"
end

local function pct(n, total)
  if total == 0 then return "--" end
  return string.format("%.1f\\,\\%%", 100 * n / total)
end

function M.typeset_summary()
  local prev = M.previous
  if not prev or prev == "" then
    tex.sprint("\\textit{(Authorship summary appears after the next LuaLaTeX run.)}")
    return
  end
  local rows, tc, tw, have_words = {}, 0, 0, true
  for entry in prev:gmatch("[^|]+") do
    local key, c, w = entry:match("^(.*)=(%d+),(%d+)$")
    if not key then key, c = entry:match("^(.*)=(%d+)$"); have_words = false end
    if key then
      c, w = tonumber(c), tonumber(w or 0)
      rows[#rows + 1] = { key = key, c = c, w = w }
      tc, tw = tc + c, tw + w
    end
  end
  if tc == 0 then return end
  local function words(n) return have_words and group_digits(n) or "--" end
  local function wpct(n) return have_words and pct(n, tw) or "--" end
  -- the table itself is left out of the counts, so they don't drift from run to run
  tex.sprint("\\begingroup\\attribute" .. attr .. "=" .. EXCLUDED .. "\\relax")
  tex.sprint("\\begin{tabular}{@{}l@{\\hspace{0.5em}}l@{\\hspace{1.5em}}rr@{\\hspace{1.5em}}rr@{}}")
  tex.sprint("\\multicolumn{2}{@{}l@{\\hspace{1.5em}}}{Author}&Characters&\\%&Words&\\%\\\\\\hline")
  for _, r in ipairs(rows) do
    tex.sprint(swatch(r.key) .. "&")
    if r.key == "Mine" then
      tex.sprint("\\AuthorshipOwnerName")       -- set with \AuthorshipOwner{...}; TeX accents work too
    else
      tex.sprint(-2, r.key:sub(2))
    end
    tex.sprint(string.format("&%s&%s&%s&%s\\\\", group_digits(r.c), pct(r.c, tc), words(r.w), wpct(r.w)))
  end
  tex.sprint(string.format("\\hline&Total&\\textbf{%s}&%s&\\textbf{%s}&%s\\\\", group_digits(tc), pct(tc, tc), words(tw), wpct(tw)))
  tex.sprint("\\end{tabular}\\endgroup")
end

----------------------------------------------------------------------
-- setup

function M.set_color(name, rgb)
  -- hex: "#cc0d73" (TeX hands # over doubled, so strip every #)
  local hex = rgb:gsub("#", ""):match("^%s*(%x%x%x%x%x%x)%s*$")
  if hex then
    colour_overrides[name] = {
      tonumber(hex:sub(1, 2), 16) / 255, tonumber(hex:sub(3, 4), 16) / 255, tonumber(hex:sub(5, 6), 16) / 255,
    }
    return
  end
  local r, g, b = rgb:match("^%s*([%d.]+)[%s,]+([%d.]+)[%s,]+([%d.]+)%s*$")
  if not r then
    warn("\\AuthorshipColor{" .. name .. "}: expected a hex colour (#cc0d73) or three numbers between 0 and 1, got '" .. rgb .. "'")
    return
  end
  colour_overrides[name] = { tonumber(r), tonumber(g), tonumber(b) }
end

function M.init(attribute_number, use_gradient)
  attr = attribute_number
  gradient = use_gradient
  luatexbase.add_to_callback("process_input_buffer", rewrite_line, "authorship.markers")
  luatexbase.add_to_callback("pre_shipout_filter", function(head) return process(head) end, "authorship.colour")
end

M.rewrite_line = rewrite_line  -- exposed for testing
return M
