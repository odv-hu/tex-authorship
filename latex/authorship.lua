-- authorship.lua -- Lua side of authorship.sty (LuaLaTeX only)
-- MIT licence, https://github.com/odv-hu/tex-authorship

local M = {}
local citation_colour = {1, 0, 0}

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

-- \AuthorshipColor / \AuthorshipGradient settings: label / key / kind ->
--   { solid = {r,g,b} }  or  { stops = { {r,g,b}, {r,g,b}, ... } }   (the last command for a name wins)
local overrides = {}
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

-- How an author is drawn: an override for its key, label or kind (most specific first),
-- else the package-wide [gradient] option for AI authors, else the default colour of its kind.
local function style_of(a)
  local o = overrides[a.key] or overrides[a.label]
  if o then return o end
  local k = overrides[a.kind]
  if gradient and a.kind == "ai" then
    -- as in earlier versions, [gradient] wins over a kind-wide solid colour;
    -- a kind-wide \AuthorshipGradient{ai}{...} replaces the default stops
    if k and k.stops then return k end
    return { stops = gradient_stops }
  end
  return k or { solid = kind_colour[a.kind] }
end

local function lerp(c1, c2, t)
  return { c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t, c1[3] + (c2[3] - c1[3]) * t }
end

-- Colour i glyphs into a gradient that runs through the stops and back to the first.
local function gradient_colour(i, stops)
  local n = #stops
  local pos = ((i % GRADIENT_PERIOD) / GRADIENT_PERIOD) * n
  local k = math.floor(pos)
  return lerp(stops[k + 1], stops[(k + 1) % n + 1], pos - k)
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

-- Review metadata is opt-in per passage. Validate against the saved source before
-- typesetting, so even a passage spanning pages cannot briefly appear reviewed.
local review_records, source_cache = {}, {}
local function review_comment(line)
  local value = line:match("^%s*%%%s*authorship%-review:%s*(.*)$")
  return value and value:gsub("%s+$", "")
end
local function source_lines(filename)
  if source_cache[filename] then return source_cache[filename] end
  local f = io.open(filename, "rb")
  if not f then return nil end
  local text = f:read("*a"); f:close()
  local lines = {}
  for line in (text .. "\n"):gmatch("(.-)\n") do lines[#lines+1] = line:gsub("\r$", "") end
  source_cache[filename] = lines
  return lines
end
local function checked_review(json, line, filename)
  local ok = pcall(require, "lualibs")
  if not ok or not utilities or not utilities.json or not sha2 then return nil end
  local parsed, r = pcall(utilities.json.tolua, json)
  if not parsed or type(r) ~= "table" or r.version ~= 1 or
      (r.status ~= "reviewed" and r.status ~= "revised") or type(r.by) ~= "string" or
      r.by:match("^%s*$") or r.by:find("[\r\n]") or type(r.color) ~= "string" or
      not r.color:match("^#%x%x%x%x%x%x$") or type(r.hash) ~= "string" or
      #r.hash ~= 64 or not r.hash:match("^[0-9a-f]+$") then return nil end
  r.stale = true
  local lines = source_lines(filename)
  if not lines or not lines[line] or review_comment(lines[line]) ~= json then return r end
  local label = (lines[line-1] or ""):match("^%s*%%%[&([^%]]+)%]%s*$")
  if not label then return nil end
  local key = "&" .. label:gsub("^%s+", ""):gsub("%s+$", "")
  local keys, body = {key}, {}
  for j=line+1,#lines do
    local close,prefix,name = lines[j]:match("^%s*%%%[(/?)([@&%*])([^%]]+)%]%s*$")
    if prefix then
      local k = prefix .. name:gsub("^%s+", ""):gsub("%s+$", "")
      if close == "/" then
        if keys[#keys] ~= k then return r end
        keys[#keys] = nil
        if #keys == 0 then
          r.stale = to_hex(sha2.digest256(key .. "\n" .. table.concat(body,"\n"))) ~= r.hash
          return r
        end
      else keys[#keys+1] = k end
    end
    if not review_comment(lines[j]) then body[#body+1] = lines[j] end
  end
  return r
end

local function rewrite_line(line)
  local json = review_comment(line)
  if json then
    local r = checked_review(json, tex.inputlineno, status.filename or "")
    if r then
      review_records[#review_records+1] = r
      return "\\directlua{authorship.set_review(" .. #review_records .. ")}%"
    end
    warn("invalid review metadata ignored")
    return nil
  end
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

function M.set_review(id)
  local inst = instances[stack[#stack]]
  if inst and inst.author.kind == "ai" then
    inst.review = review_records[id]
    inst.review.used = true
    if inst.review.stale then warn("AI passage changed since " .. inst.review.status .. " by " .. inst.review.by) end
  end
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
  local citation = M.citation_attr and get_attribute(n, M.citation_attr) == 1
  local inst = id and instances[id]
  if not inst then
    if n.id == GLYPH then count_glyph(n, "Mine") end
    if citation then return "citation", citation_colour end
    return nil
  end
  local a = inst.author
  if n.id == GLYPH then count_glyph(n, a.key) end
  if citation then return "citation", citation_colour end
  local style = style_of(a)
  if style.stops then
    local step = math.floor(inst.n / GRADIENT_STEP)
    inst.n = inst.n + 1
    local c = gradient_colour(step * GRADIENT_STEP, style.stops)
    if inst.review and not inst.review.stale then c = lerp(c, {1,1,1}, 0.55) end
    return id .. ":" .. step, c
  end
  if inst.review and not inst.review.stale then return id .. ":review", lerp(style.solid, {1,1,1}, 0.55) end
  return a.key, style.solid
end

-- Zero-net-width rules in the left margin of each affected text line. Added
-- after counting/colouring, so the bars themselves never enter statistics.
local function review_bars(line)
  local found, ordered = {}, {}
  local function scan(head)
    for n in node.traverse(head) do
      if n.id == GLYPH then
        local inst = instances[get_attribute(n,attr)]
        local r = inst and inst.review
        if r then
          local key = r.by .. r.color .. r.status .. tostring(r.stale)
          if not found[key] then found[key] = true; ordered[#ordered+1] = r end
        end
      elseif (n.id == HLIST or n.id == VLIST) and n.head then scan(n.head) end
    end
  end
  scan(line.head)
  for i,r in ipairs(ordered) do
    local c = {}
    for h in r.color:gmatch("%x%x") do c[#c+1] = tonumber(h,16)/255 end
    for bar=1,(r.status == "revised" and not r.stale and 2 or 1) do
      local offset, width = tex.sp((3+i*5+bar*2) .. "pt"), tex.sp("1pt")
      local first = line.head
      local back = node.new("kern"); back.kern = -offset
      local rule = node.new("rule"); rule.width = width
      rule.height = r.stale and tex.sp("2pt") or line.height
      rule.depth = r.stale and 0 or line.depth
      local forward = node.new("kern"); forward.kern = offset-width
      line.head = node.insert_before(line.head,first,back)
      line.head = node.insert_before(line.head,first,push(c))
      line.head = node.insert_before(line.head,first,rule)
      line.head = node.insert_before(line.head,first,pop())
      line.head = node.insert_before(line.head,first,forward)
    end
  end
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
      if id == HLIST and n.subtype == 1 and n.head then review_bars(n) end
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

local function swatch(key)
  local bands = {}
  if key == "Mine" then
    bands[1] = "\\AuthorshipBand{1}{0 0 0}"
  else
    local style = style_of(author(key))
    if style.stops then
      for i = 0, SWATCH_BANDS - 1 do
        local c = gradient_colour(math.floor(i * GRADIENT_PERIOD / SWATCH_BANDS), style.stops)
        bands[#bands + 1] = string.format("\\AuthorshipBand{%.4f}{%s}", 1 / SWATCH_BANDS, rgb_string(c))
      end
    else
      bands[1] = "\\AuthorshipBand{1}{" .. rgb_string(style.solid) .. "}"
    end
  end
  return "\\AuthorshipSwatchBox{" .. table.concat(bands) .. "}"
end

local function pct(n, total)
  if total == 0 then return "--" end
  return string.format("%.1f\\,\\%%", 100 * n / total)
end

function M.typeset_review_legend()
  local seen, rows = {}, {}
  for _,r in ipairs(review_records) do
    local key = r.by .. r.status .. r.color .. tostring(r.stale)
    if r.used and not seen[key] then seen[key] = true; rows[#rows+1] = r end
  end
  if #rows == 0 then return end
  tex.sprint("\\par\\begingroup\\attribute" .. attr .. "=" .. EXCLUDED .. "\\relax\\small\\medskip\\noindent AI review legend (origin unchanged):\\par")
  for _,r in ipairs(rows) do
    local c = {}
    for h in r.color:gmatch("%x%x") do c[#c+1] = string.format("%.3f",tonumber(h,16)/255) end
    tex.sprint("\\noindent\\AuthorshipSwatchBox{\\AuthorshipBand{1}{" .. table.concat(c," ") .. "}}\\enspace ")
    local label = r.stale and "Changed since review (short bar): " or r.status == "revised" and "Revised (double bar): " or "Reviewed (single bar): "
    tex.sprint(-2,label .. r.by)
    tex.sprint("\\par")
  end
  tex.sprint("\\endgroup")
end

function M.typeset_summary(full_width)
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
  if full_width then
    tex.sprint("\\begin{tabular*}{\\linewidth}{@{}l@{\\hspace{0.5em}}l@{\\extracolsep{\\fill}}rrrr@{}}")
  else
    tex.sprint("\\begin{tabular}{@{}l@{\\hspace{0.5em}}l@{\\hspace{1.5em}}rr@{\\hspace{1.5em}}rr@{}}")
  end
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
  tex.sprint((full_width and "\\end{tabular*}" or "\\end{tabular}") .. "\\endgroup")
  M.typeset_review_legend()
end

----------------------------------------------------------------------
-- setup

-- One colour: hex ("#cc0d73"; TeX hands # over doubled, so every # is stripped) or three numbers 0-1.
local function parse_colour(text)
  local hex = text:gsub("#", ""):match("^%s*(%x%x%x%x%x%x)%s*$")
  if hex then
    return { tonumber(hex:sub(1, 2), 16) / 255, tonumber(hex:sub(3, 4), 16) / 255, tonumber(hex:sub(5, 6), 16) / 255 }
  end
  local r, g, b = text:match("^%s*([%d.]+)[%s,]+([%d.]+)[%s,]+([%d.]+)%s*$")
  if r then return { tonumber(r), tonumber(g), tonumber(b) } end
  return nil
end

function M.set_citation_color(rgb)
  local c = parse_colour(rgb)
  if not c or not c[1] or not c[2] or not c[3]
      or c[1] < 0 or c[1] > 1 or c[2] < 0 or c[2] > 1 or c[3] < 0 or c[3] > 1 then
    warn("\\AuthorshipCitationColor: expected hex or three numbers between 0 and 1; keeping previous colour")
    return
  end
  citation_colour = c
end

function M.set_color(name, rgb)
  local c = parse_colour(rgb)
  if not c then
    warn("\\AuthorshipColor{" .. name .. "}: expected a hex colour (#cc0d73) or three numbers between 0 and 1, got '" .. rgb:gsub("##", "#") .. "'")
    return
  end
  overrides[name] = { solid = c }
end

-- \AuthorshipGradient{name}{stop, stop, ...}: two or more colours, separated by commas,
-- or by semicolons when the colours are written as numbers with commas in them.
function M.set_gradient(name, list)
  local sep = list:find(";") and ";" or ","
  local stops = {}
  for part in (list .. sep):gmatch("(.-)" .. sep) do
    if part:match("%S") then
      local c = parse_colour(part)
      if not c then
        warn("\\AuthorshipGradient{" .. name .. "}: could not read the colour '" .. part:gsub("##", "#") .. "'")
        return
      end
      stops[#stops + 1] = c
    end
  end
  if #stops < 2 then
    warn("\\AuthorshipGradient{" .. name .. "}: needs at least two colours")
    return
  end
  overrides[name] = { stops = stops }
end

function M.init(attribute_number, use_gradient)
  attr = attribute_number
  gradient = use_gradient
  luatexbase.add_to_callback("process_input_buffer", rewrite_line, "authorship.markers")
  luatexbase.add_to_callback("pre_shipout_filter", function(head) return process(head) end, "authorship.colour")
end

M.rewrite_line = rewrite_line  -- exposed for testing
return M
