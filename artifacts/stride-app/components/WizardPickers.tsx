import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";

// ── Constants ─────────────────────────────────────────────────────────────────

const ITEM_H       = 52;
const DRUM_H       = ITEM_H * 5;   // 260 — shows 5 items
const CELL         = 44;           // calendar day cell

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DOW_CAL = ["Mo","Tu","We","Th","Fr","Sa","Su"];

export const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
export const MINS  = ["00","05","10","15","20","25","30","35","40","45","50","55"];

// ── DrumRoll ──────────────────────────────────────────────────────────────────

export function DrumRoll({ items, value, onChange }: {
  items: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const colors          = useColors();
  const idx             = Math.max(0, items.indexOf(value));
  const ref             = useRef<ScrollView>(null);
  const selRef          = useRef(idx);
  const [selIdx, setSelIdx] = useState(idx);
  const hasMomentumRef  = useRef(false);
  const dragSnapTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      ref.current?.scrollTo({ y: idx * ITEM_H, animated: false });
    }, 80);
    return () => clearTimeout(t);
  }, []);

  const snap = (rawY: number) => {
    const clamped = Math.max(0, Math.min(items.length - 1, Math.round(rawY / ITEM_H)));
    selRef.current = clamped;
    setSelIdx(clamped);
    onChange(items[clamped] ?? value);
    ref.current?.scrollTo({ y: clamped * ITEM_H, animated: true });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={{ flex: 1, height: DRUM_H, overflow: "hidden" }}>
      <View
        pointerEvents="none"
        style={{
          position: "absolute", top: ITEM_H * 2, left: 0, right: 0,
          height: ITEM_H, borderTopWidth: 1.5, borderBottomWidth: 1.5,
          borderColor: colors.primary, zIndex: 2,
        }}
      />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingVertical: ITEM_H * 2 }}
        onScrollBeginDrag={() => { hasMomentumRef.current = false; }}
        onScrollEndDrag={e => {
          const y = e.nativeEvent.contentOffset.y;
          // Schedule a snap; if momentum kicks in, onMomentumScrollBegin will cancel it
          if (dragSnapTimer.current) clearTimeout(dragSnapTimer.current);
          dragSnapTimer.current = setTimeout(() => {
            if (!hasMomentumRef.current) snap(y);
          }, 60);
        }}
        onMomentumScrollBegin={() => {
          hasMomentumRef.current = true;
          if (dragSnapTimer.current) { clearTimeout(dragSnapTimer.current); dragSnapTimer.current = null; }
        }}
        onMomentumScrollEnd={e => {
          hasMomentumRef.current = false;
          snap(e.nativeEvent.contentOffset.y);
        }}
      >
        {items.map((item, i) => (
          <Pressable
            key={i}
            style={{ height: ITEM_H, alignItems: "center", justifyContent: "center" }}
            onPress={() => {
              ref.current?.scrollTo({ y: i * ITEM_H, animated: true });
              setTimeout(() => snap(i * ITEM_H), 320);
            }}
          >
            <Text
              style={{
                fontSize:   i === selIdx ? 24 : 16,
                fontWeight: i === selIdx ? "700" : "400",
                color:      i === selIdx ? colors.foreground : colors.mutedForeground + "99",
              }}
            >
              {item}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

// ── CalendarPicker ────────────────────────────────────────────────────────────

export function CalendarPicker({ value, onConfirm }: {
  value: string;              // "DD/MM/YYYY" or ""
  onConfirm: (v: string) => void;
}) {
  const colors = useColors();
  const today  = new Date();

  const parseVal = () => {
    if (value) {
      const parts = value.split("/");
      if (parts.length === 3) {
        const [d, m, y] = parts;
        const dt = new Date(parseInt(y!), parseInt(m!) - 1, parseInt(d!));
        if (!isNaN(dt.getTime())) return dt;
      }
    }
    return today;
  };

  const init = parseVal();
  const [viewYear,  setViewYear]  = useState(init.getFullYear());
  const [viewMonth, setViewMonth] = useState(init.getMonth());
  const [selDay,    setSelDay]    = useState<number | null>(value ? init.getDate() : null);
  const [selMo,     setSelMo]     = useState(init.getMonth());
  const [selYr,     setSelYr]     = useState(init.getFullYear());

  const prevMo = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMo = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const firstDow    = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  const isSel   = (d: number) => d === selDay && viewMonth === selMo && viewYear === selYr;
  const isToday = (d: number) =>
    d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();

  const confirm = () => {
    if (selDay == null) return;
    const dd = String(selDay).padStart(2, "0");
    const mm = String(selMo + 1).padStart(2, "0");
    onConfirm(`${dd}/${mm}/${selYr}`);
  };

  return (
    <View style={[wp.calCard, { backgroundColor: colors.card }]}>
      {/* Month navigation */}
      <View style={wp.calHeader}>
        <Pressable onPress={prevMo} hitSlop={14} style={wp.calNavBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </Pressable>
        <Text style={[wp.calMonthTitle, { color: colors.foreground }]}>
          {MONTH_NAMES[viewMonth]} {viewYear}
        </Text>
        <Pressable onPress={nextMo} hitSlop={14} style={wp.calNavBtn}>
          <Ionicons name="chevron-forward" size={22} color={colors.primary} />
        </Pressable>
      </View>

      {/* Day-of-week header */}
      <View style={wp.calDowRow}>
        {DOW_CAL.map(d => (
          <View key={d} style={{ width: CELL, alignItems: "center" }}>
            <Text style={[wp.calDow, { color: colors.mutedForeground }]}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Calendar grid */}
      <View>
        {rows.map((row, ri) => (
          <View key={ri} style={{ flexDirection: "row" }}>
            {row.map((d, ci) => {
              if (d === null) return <View key={ci} style={{ width: CELL, height: CELL }} />;
              const sel = isSel(d);
              const tod = isToday(d);
              return (
                <Pressable
                  key={ci}
                  style={[
                    wp.calCell,
                    sel && { backgroundColor: colors.primary },
                    tod && !sel && { borderWidth: 1.5, borderColor: colors.primary },
                  ]}
                  onPress={() => {
                    setSelDay(d);
                    setSelMo(viewMonth);
                    setSelYr(viewYear);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Text
                    style={[
                      wp.calDayText,
                      { color: sel ? "#fff" : tod ? colors.primary : colors.foreground },
                    ]}
                  >
                    {d}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      {/* Confirm button */}
      <Pressable
        style={[
          wp.confirmBtn,
          { backgroundColor: selDay ? colors.primary : colors.muted, marginTop: 14 },
        ]}
        onPress={confirm}
        disabled={selDay == null}
      >
        <Text style={wp.confirmText}>
          {selDay
            ? `Confirm — ${String(selDay).padStart(2,"0")}/${String(selMo+1).padStart(2,"0")}/${selYr}`
            : "Select a date"}
        </Text>
      </Pressable>
    </View>
  );
}

// ── TimePickerSheet ───────────────────────────────────────────────────────────

export function TimePickerSheet({ value, onConfirm }: {
  value: string;
  onConfirm: (v: string) => void;
}) {
  const colors = useColors();
  const parts  = value && value.includes(":") ? value.split(":") : ["09", "00"];
  const initH  = String(parseInt(parts[0] ?? "9")).padStart(2, "0");
  const initM  = String(Math.round(parseInt(parts[1] ?? "0") / 5) * 5).padStart(2, "0");

  const [selH, setSelH] = useState(initH);
  const [selM, setSelM] = useState(initM);

  return (
    <View style={[wp.sheet, { backgroundColor: colors.card }]}>
      <Text style={[wp.sheetTitle, { color: colors.foreground }]}>Select Time</Text>

      <View style={[wp.drumRow, { justifyContent: "center" }]}>
        <DrumRoll items={HOURS} value={selH} onChange={setSelH} />
        <Text style={[wp.drumSep, { color: colors.foreground }]}>:</Text>
        <DrumRoll items={MINS}  value={selM} onChange={setSelM} />
      </View>

      <Pressable
        style={[wp.confirmBtn, { backgroundColor: colors.primary }]}
        onPress={() => onConfirm(`${selH}:${selM}`)}
      >
        <Text style={wp.confirmText}>OK — {selH}:{selM}</Text>
      </Pressable>
    </View>
  );
}

// ── NumberPickerSheet ─────────────────────────────────────────────────────────

export function NumberPickerSheet({ value, min, max, label, onConfirm }: {
  value: string;
  min: number;
  max: number;
  label: string;
  onConfirm: (v: string) => void;
}) {
  const colors = useColors();
  const items  = Array.from({ length: max - min + 1 }, (_, i) => String(i + min));
  const [sel, setSel] = useState(value);

  return (
    <View style={[wp.sheet, { backgroundColor: colors.card }]}>
      <Text style={[wp.sheetTitle, { color: colors.foreground }]}>{label}</Text>
      <View style={{ paddingHorizontal: 60 }}>
        <DrumRoll items={items} value={sel} onChange={setSel} />
      </View>
      <Pressable
        style={[wp.confirmBtn, { backgroundColor: colors.primary, marginTop: 20 }]}
        onPress={() => onConfirm(sel)}
      >
        <Text style={wp.confirmText}>Confirm  {sel}</Text>
      </Pressable>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const wp = StyleSheet.create({
  // Calendar card
  calCard:       { borderRadius: 20, padding: 16, width: CELL * 7 + 32 },
  calHeader:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  calNavBtn:     { padding: 6 },
  calMonthTitle: { fontSize: 17, fontWeight: "700" },
  calDowRow:     { flexDirection: "row", marginBottom: 4 },
  calDow:        { fontSize: 11, fontWeight: "700", paddingVertical: 4 },
  calCell:       { width: CELL, height: CELL, borderRadius: CELL / 2, alignItems: "center", justifyContent: "center" },
  calDayText:    { fontSize: 14, fontWeight: "600" },

  // Bottom sheet
  sheet:      { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  sheetTitle: { fontSize: 17, fontWeight: "700", textAlign: "center", marginBottom: 16 },
  drumRow:    { flexDirection: "row", alignItems: "center", marginBottom: 24, marginHorizontal: 8 },
  drumSep:    { fontSize: 30, fontWeight: "700", paddingHorizontal: 6 },

  // Confirm button (shared)
  confirmBtn:  { borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  confirmText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  // Time stepper buttons
  stepperBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
});
