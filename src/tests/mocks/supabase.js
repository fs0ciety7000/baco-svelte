import { vi } from 'vitest';

/**
 * Mock Supabase client pour les tests
 */
export const createMockSupabase = (mockData = {}) => {
    const mockSelect = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockReturnThis();
    const mockOrder = vi.fn().mockReturnThis();
    const mockRange = vi.fn().mockReturnThis();
    const mockSingle = vi.fn();
    const mockUpsert = vi.fn().mockReturnThis();
    const mockInsert = vi.fn();
    const mockDelete = vi.fn().mockReturnThis();

    return {
        from: vi.fn((table) => {
            // Configure mock responses based on table
            if (mockData[table]) {
                mockSingle.mockResolvedValue(mockData[table].single || { data: null, error: null });
                mockInsert.mockResolvedValue(mockData[table].insert || { data: null, error: null });
                mockDelete.mockResolvedValue(mockData[table].delete || { data: null, error: null });
            }

            return {
                select: (...args) => {
                    const selectData = mockData[table]?.select || { data: [], error: null };

                    return {
                        eq: mockEq,
                        order: mockOrder,
                        range: (...rangeArgs) => {
                            return Promise.resolve(selectData);
                        },
                        single: () => Promise.resolve(mockData[table]?.single || { data: null, error: null }),
                        then: (resolve) => resolve(selectData)
                    };
                },
                upsert: (...args) => ({
                    select: () => ({
                        single: () => Promise.resolve(mockData[table]?.upsert || { data: {}, error: null })
                    })
                }),
                insert: (...args) => Promise.resolve(mockData[table]?.insert || { data: null, error: null }),
                delete: () => ({
                    eq: () => Promise.resolve(mockData[table]?.delete || { data: null, error: null })
                })
            };
        }),
        auth: {
            getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
            signIn: vi.fn().mockResolvedValue({ data: null, error: null }),
            signOut: vi.fn().mockResolvedValue({ data: null, error: null })
        }
    };
};
