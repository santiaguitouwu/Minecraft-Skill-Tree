import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';

export const DEFAULT_SOURCE_URL = 'https://minecraft.capta.co/BaseSkillTree.json';
/*export const DEFAULT_SOURCE_URL = '/test/TestSkillTree.json';*/

interface RawNode {
    name: string;
    description: string;
    image: string;
    children: RawNode[];
}

export interface SkillNode {
    id: string;
    name: string;
    description: string;
    image: string;
    childrenIds: string[];
}

export interface SliceState {
    entities: Record<string, SkillNode>;
    rootId: string | null;
    status: 'idle' | 'loading' | 'succeeded' | 'failed';
    error?: string | null;
    sourceUrl: string;
    completed: Record<string, boolean>;
}

// --- Normalizador ---
function normalizeTree(root: RawNode) {
    const entities: Record<string, SkillNode> = {};
    const walk = (node: RawNode, path: string): string => {
        const id = path;
        const childrenIds = node.children.map((child, index) =>
            walk(child, path ? `${path}/${index}` : `${index}`)
        );
        entities[id] = { id, name: node.name, description: node.description, image: node.image, childrenIds };
        return id;
    };
    const rootId = walk(root, '0');
    return { entities, rootId };
}

// --- Helpers ---
const getParentId = (id: string): string | null => {
    const last = id.lastIndexOf('/');
    return last === -1 ? null : id.slice(0, last);
};

// --- Thunk para descargar y normalizar ---
export const fetchSkillTree = createAsyncThunk<
    { entities: Record<string, SkillNode>; rootId: string; sourceUrl: string },
    string
>('skillTree/fetch', async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as RawNode;
    const { entities, rootId } = normalizeTree(data);
    return { entities, rootId, sourceUrl: url };
});

const initialState: SliceState = {
    entities: {},
    rootId: null,
    status: 'idle',
    error: null,
    sourceUrl: DEFAULT_SOURCE_URL,
    completed: {},
};

export const slice = createSlice({
    name: 'Minecraft-Skill-Tree',
    initialState,
    reducers: {
        setSourceUrl(state, action: PayloadAction<string>) {
            state.sourceUrl = action.payload;
        },

        // (si aún quieres impedir deseleccionar, deja esto así:)
        tryToggleNode(state, action: PayloadAction<string>) {
            const id = action.payload;
            // no permitir desmarcar si ya está completado
            if (state.completed[id]) return;

            const parentId = getParentId(id);
            const canComplete = parentId === null || !!state.completed[parentId];
            if (canComplete) state.completed[id] = true;
        },

        resetProgress(state) {
            state.completed = {};
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchSkillTree.pending, (state) => {
                state.status = 'loading';
                state.error = null;
            })
            .addCase(fetchSkillTree.fulfilled, (state, action) => {
                state.status = 'succeeded';
                state.entities = action.payload.entities;
                state.rootId = action.payload.rootId;
                state.sourceUrl = action.payload.sourceUrl; // refleja la última
                state.completed = {};
            })
            .addCase(fetchSkillTree.rejected, (state, action) => {
                state.status = 'failed';
                state.error = action.error.message ?? 'Error desconocido';
            });
    },
});

export const { setSourceUrl, tryToggleNode, resetProgress } = slice.actions;

// Selectores
export const selectStatus = (s: { entities: SliceState }) => s.entities.status;
export const selectError = (s: { entities: SliceState }) => s.entities.error;
export const selectSourceUrl = (s: { entities: SliceState }) => s.entities.sourceUrl;
export const selectRootId = (s: { entities: SliceState }) => s.entities.rootId;
export const selectEntities = (s: { entities: SliceState }) => s.entities.entities;
export const selectCompleted = (s: { entities: SliceState }) => s.entities.completed;

export default slice.reducer;
