import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(
    new URL("../src/trackers/desiSlots.ts", import.meta.url),
    "utf8"
);
const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2020,
    },
});
const { possibleDesiSlot } = await import(
    `data:text/javascript,${encodeURIComponent(outputText)}`
);

const slot = (name, ...existing) =>
    possibleDesiSlot(
        { name },
        existing.map((name) => ({ name }))
    );

test("WEB types and Blu-ray encodes occupy separate slots", () => {
    assert.equal(slot("1080p WEBRip x264", "1080p WEB-DL AVC"), true);
    assert.equal(slot("1080p WEB-DL AVC", "1080p BluRay x264 DDP"), true);
    assert.equal(slot("1080p WEB-DL AVC", "1080p WEB-DL AVC"), false);
});

test("WEB-DLs distinguish providers, explicit audio variants, and cuts", () => {
    assert.equal(slot("1080p NF WEB-DL AVC", "1080p AMZN WEB-DL H.264"), true);
    assert.equal(slot("1080p NF WEB-DL AVC", "1080p AMZN WEB-DL"), false);
    assert.equal(
        slot(
            "1080p NF WEB-DL Multi Audio AVC",
            "1080p NF WEB-DL Original Audio AVC"
        ),
        true
    );
    assert.equal(
        slot("1080p NF WEB-DL Multi Audio AVC", "1080p NF WEB-DL AVC"),
        false
    );
    assert.equal(
        slot("Extended 1080p WEB-DL AVC", "Theatrical 1080p WEB-DL AVC"),
        true
    );
});

test("2160p colour slots and HDR10+ overlap", () => {
    assert.equal(
        slot("2160p WEB-DL DV P5 HEVC", "2160p WEB-DL DV P8 HEVC"),
        true
    );
    assert.equal(slot("2160p WEB-DL SDR HEVC", "2160p WEB-DL DV HEVC"), false);
    assert.equal(
        slot("2160p WEB-DL HDR10+ HEVC", "2160p WEB-DL DV P8 HDR10+ HEVC"),
        false
    );
    assert.equal(
        slot("2160p WEB-DL HDR10+ HEVC", "2160p WEB-DL DV P8 HEVC"),
        true
    );
    assert.equal(slot("1080p WEB-DL DV P5 HEVC", "720p WEB-DL SDR"), false);
});

test("encode limits, audio checks, and DVD slot", () => {
    const encode = "1080p BluRay x264 DDP";
    assert.equal(slot(encode, encode), false);
    assert.equal(slot(encode, `${encode}-GroupA`), true);
    assert.equal(slot(encode, `${encode}-GroupA`, `${encode}-GroupB`), false);
    assert.equal(slot("1080p BluRay x265 DDP", encode), false);
    assert.equal(slot("1080p UHD BluRay x265 DDP", encode), true);
    assert.equal(slot("2160p BluRay SDR x265 DDP", encode), false);
    assert.equal(slot("2160p BluRay SDR x265 TrueHD", encode), true);
    assert.equal(slot("DVD Rip 480p x264", "DVD Rip 576p x264"), false);
    assert.equal(slot("DVD Rip 480p x264", "Untouched DVD9"), true);
});

test("incomplete or unclassified listings do not prove vacancies", () => {
    assert.equal(slot("1080p WEB-DL AVC"), false);
    assert.equal(slot("1080p WEB-DL AVC", "1080p Unclassified"), false);
});
