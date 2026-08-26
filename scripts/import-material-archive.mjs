import { execFile as execFileCallback } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

const execFile = promisify(execFileCallback);

const archive = process.argv[2] ?? "/Users/jordan/Desktop/Texture/Archive.zip";
const outputRoot = "compiler/material-library/local";
const textureSize = Number(process.env.GOLFIN_MATERIAL_SIZE ?? 1024);

const materialSpecs = {
  out_of_bounds: {
    directory: "OOB Grass",
    scaleMetres: 16,
    normalStrength: 0.13,
    heightStrength: 0.32,
  },
  rough: {
    directory: "ROUGH GRASS",
    scaleMetres: 12,
    normalStrength: 0.09,
    heightStrength: 0.2,
  },
  fairway: {
    directory: "FAIRWAY GRASS",
    scaleMetres: 10,
    normalStrength: 0.055,
    heightStrength: 0.11,
  },
  green: {
    directory: "GREEN GRASS",
    scaleMetres: 7,
    normalStrength: 0.025,
    heightStrength: 0.045,
  },
  tee: {
    directory: "TEEBOX GRASS",
    scaleMetres: 8,
    normalStrength: 0.035,
    heightStrength: 0.065,
  },
  bunker: {
    directory: "BUNKER SAND",
    scaleMetres: 5,
    normalStrength: 0.12,
    heightStrength: 0.18,
  },
  water: {
    directory: "WATER",
    scaleMetres: 18,
    normalStrength: 0.08,
    heightStrength: 0.02,
  },
  rock: {
    directory: "ROCK",
    scaleMetres: 6,
    normalStrength: 0.16,
    heightStrength: 0.24,
  },
  mud: {
    directory: "MUD",
    scaleMetres: 4,
    normalStrength: 0.11,
    heightStrength: 0.18,
  },
  worn_edge: {
    directory: "WORN EDGE",
    scaleMetres: 4,
    normalStrength: 0.1,
    heightStrength: 0.16,
  },
};

const channelMatchers = {
  albedo: [/(basecolor|color|diffuse|diff|texture)(?!.*normal)/i],
  normal: [/(normalgl|normal_gl|nor_gl)/i, /normal(?!.*dx)/i, /nor(?!.*dx)/i],
  height: [/(displacement|height|disp|bump)/i],
  roughness: [/roughness|rough/i],
  ao: [/ambientocclusion|ambient_occlusion|rough_ao|_ao_/i, /ao/i],
  mask: [/mask/i],
};

const allowedImage = /\.(png|jpe?g|tiff?)$/i;

async function main() {
  const entries = await listArchiveEntries();
  await mkdir(outputRoot, { recursive: true });

  const manifest = {
    schema: "golfin.local-material-library.v0",
    sourcePolicy: "user-supplied-local-assets-not-for-redistribution",
    sourceArchive: archive,
    textureSize,
    generatedAt: new Date().toISOString(),
    materials: {},
  };

  for (const [materialId, spec] of Object.entries(materialSpecs)) {
    const materialEntries = entries.filter((entry) => entry.startsWith(`${spec.directory}/`) && allowedImage.test(entry));
    const outputDirectory = join(outputRoot, materialId);
    await mkdir(outputDirectory, { recursive: true });

    const channels = {};
    const sourceEntries = {};
    for (const [channel, matchers] of Object.entries(channelMatchers)) {
      const entry = pickChannelEntry(materialEntries, matchers);
      if (!entry) {
        continue;
      }

      const outputName = `${channel}.png`;
      const input = await readArchiveEntry(entry);
      await sharp(input)
        .rotate()
        .resize({ width: textureSize, height: textureSize, fit: "cover" })
        .ensureAlpha()
        .png({ compressionLevel: 9, palette: false })
        .toFile(join(outputDirectory, outputName));
      channels[channel] = `${materialId}/${outputName}`;
      sourceEntries[channel] = entry;
    }

    manifest.materials[materialId] = {
      sourceDirectory: spec.directory,
      scaleMetres: spec.scaleMetres,
      normalStrength: spec.normalStrength,
      heightStrength: spec.heightStrength,
      channels,
      sourceEntries,
      license: "user-supplied-local",
    };
  }

  await writeFile(join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ output: outputRoot, textureSize, materials: Object.keys(manifest.materials) }, null, 2));
}

async function listArchiveEntries() {
  const { stdout } = await execFile("unzip", ["-Z1", archive], { encoding: "utf8", maxBuffer: 1024 * 1024 * 8 });
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((entry) => entry && !entry.startsWith("__MACOSX/") && !basename(entry).startsWith("._") && basename(entry) !== ".DS_Store");
}

function pickChannelEntry(entries, matchers) {
  const candidates = entries.filter((entry) => matchers.some((matcher) => matcher.test(entry)));
  if (candidates.length === 0) {
    return null;
  }

  return candidates.sort((a, b) => scoreEntry(b) - scoreEntry(a))[0];
}

function scoreEntry(entry) {
  let score = 0;
  if (/normalgl|nor_gl/i.test(entry)) {
    score += 10;
  }
  if (/normaldx|normal_dx/i.test(entry)) {
    score -= 20;
  }
  if (/4k/i.test(entry)) {
    score += 4;
  }
  if (/png$/i.test(entry)) {
    score += 2;
  }
  if (/tiff?$/i.test(entry)) {
    score += 1;
  }
  return score;
}

async function readArchiveEntry(entry) {
  const { stdout } = await execFile("unzip", ["-p", archive, entry], {
    encoding: "buffer",
    maxBuffer: 256 * 1024 * 1024,
  });
  return stdout;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
