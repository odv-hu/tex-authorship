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
local mine_count = 0

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
-- shipout: colour every glyph (and rule) carrying the attribute

local function colour_for(n)
  local id = get_attribute(n, attr)
  local inst = id and instances[id]
  if not inst then
    if n.id == GLYPH then mine_count = mine_count + 1 end
    return nil
  end
  local a = inst.author
  if n.id == GLYPH then a.count = a.count + 1 end
  if gradient and a.kind == "ai" and not (colour_overrides[a.key] or colour_overrides[a.label]) then
    local step = math.floor(inst.n / GRADIENT_STEP)
    inst.n = inst.n + 1
    return id .. ":" .. step, gradient_colour(step * GRADIENT_STEP)
  end
  return a.key, colour_of_author(a)
end

local function process(head)
  local current = nil
  local n = head
  while n do
    local id = n.id
    if id == GLYPH or id == RULE then
      local key, c = colour_for(n)
      if key ~= current then
        if current then head = node.insert_before(head, n, pop()) end
        if key then head = node.insert_before(head, n, push(c)) end
        current = key
      end
    elseif id == HLIST or id == VLIST then
      if current then head = node.insert_before(head, n, pop()); current = nil end
      if n.head then n.head = process(n.head) end
    end
    n = n.next
  end
  if current then node.insert_after(head, node.tail(head), pop()) end
  return head
end

----------------------------------------------------------------------
-- summary

local function summary_string()
  local parts = { "Mine=" .. mine_count }
  for _, key in ipairs(author_order) do
    local a = authors[key]
    if a.count > 0 then parts[#parts + 1] = key .. "=" .. a.count end
  end
  return table.concat(parts, "|")
end

function M.finish()
  if #stack > 0 then
    warn("marker %[" .. instances[stack[#stack]].author.key .. "] is never closed")
  end
  local s = summary_string()
  texio.write_nl("term and log", "authorship: glyphs per author: " .. (s:gsub("|", ", ")))
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

function M.typeset_summary()
  local prev = M.previous
  if not prev or prev == "" then
    tex.sprint("\\textit{(Authorship summary appears after the next LuaLaTeX run.)}")
    return
  end
  local rows, total = {}, 0
  for entry in prev:gmatch("[^|]+") do
    local key, n = entry:match("^(.*)=(%d+)$")
    if key then
      n = tonumber(n)
      rows[#rows + 1] = { key = key, n = n }
      total = total + n
    end
  end
  if total == 0 then return end
  tex.sprint("\\begin{tabular}{@{}lrr@{}}")
  for _, r in ipairs(rows) do
    local label = r.key == "Mine" and "Mine" or r.key:sub(2)
    tex.sprint(-2, label)
    tex.sprint(string.format("&%s&%.1f\\,\\%%\\\\", group_digits(r.n), 100 * r.n / total))
  end
  tex.sprint("\\end{tabular}")
end

----------------------------------------------------------------------
-- setup

function M.set_color(name, rgb)
  local r, g, b = rgb:match("^%s*([%d.]+)[%s,]+([%d.]+)[%s,]+([%d.]+)%s*$")
  if not r then
    warn("\\AuthorshipColor{" .. name .. "}: expected three numbers between 0 and 1, got '" .. rgb .. "'")
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
