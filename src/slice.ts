import { createSlice } from '@reduxjs/toolkit';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SliceState {}

const initialState: SliceState = {};

export const slice = createSlice({
    name: 'Minecraft-Skill-Tree',
    initialState,
    reducers: {},
});

// Action creators are generated for each case reducer function
export const Actions = { ...slice.actions };

export default slice.reducer;
