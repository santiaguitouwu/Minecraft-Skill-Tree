import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';

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

    // progreso:
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
        entities[id] = {
            id,
            name: node.name,
            description: node.description,
            image: node.image,
            childrenIds,
        };
        return id;
    };

    const rootId = walk(root, '0');
    return { entities, rootId };
}

// --- Helpers (dep/parents/descendants) ---
const getParentId = (id: string): string | null => {
    const last = id.lastIndexOf('/');
    if (last === -1) return null;
    return id.slice(0, last);
};

const collectDescendants = (entities: Record<string, SkillNode>, id: string, acc: string[] = []) => {
    const node = entities[id];
    if (!node) return acc;
    for (const cid of node.childrenIds) {
        acc.push(cid);
        collectDescendants(entities, cid, acc);
    }
    return acc;
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
    sourceUrl: 'https://minecraft.capta.co/BaseSkillTree.json',
    completed: {},
};

export const slice = createSlice({
    name: 'Minecraft-Skill-Tree',
    initialState,
    reducers: {
        setSourceUrl(state, action: PayloadAction<string>) {
            state.sourceUrl = action.payload;
        },

        // Intenta alternar el estado del nodo cumpliendo la regla:
        // - Sólo puedes completar si el padre está completado (o es raíz).
        // - Si desmarcas, se desmarcan todos sus descendientes.
        tryToggleNode(state, action: PayloadAction<string>) {
            const id = action.payload;
            const isCompleted = !!state.completed[id];

            if (isCompleted) {
                // Un-complete y cascada hacia abajo
                state.completed[id] = false;
                const desc = collectDescendants(state.entities, id);
                for (const d of desc) state.completed[d] = false;
                return;
            }

            // Intento de completar: validar padre
            const parentId = getParentId(id);
            if (parentId === null || state.completed[parentId]) {
                state.completed[id] = true;
            }
            // Si no cumple, no hace nada (UI puede mostrar feedback/tooltip si quieres)
        },

        // util por si quieres limpiar progreso al cambiar de URL
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
                state.sourceUrl = action.payload.sourceUrl;
                state.completed = {}; // al cargar otro árbol, limpiar progreso
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
