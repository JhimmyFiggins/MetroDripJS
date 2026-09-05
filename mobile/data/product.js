export const products = [
    {
        id: 1,
        product_name: "Product 1",
        description: "Description here",
        price: 100.00
    },
    {
        id: 2,
        product_name: "Product 2",
        description: "Description",
        price: 100.11

    },
    {
        id: 3,
        product_name: "Product 3",
        description: "Description",
        price: 100.00
    },
    {
        id: 4,
        product_name: "Product 4",
        description: "Description",
        price: 100.00
    },
    {
        id: 5,
        product_name: "Product 5",
        description: "Description",
        price: 100.00
    },
    {
        id: 7,
        product_name: "Product 6",
        description: "Description",
        price: 100.00
    },
]

export const pAttribute = {
    1: [
        { id: 1, attribute: "S" },
        { id: 2, attribute: "M" },
    ],
    2: [
        { id: 1, attribute: "S" },
        { id: 2, attribute: "M" },
    ],
    3: [
        { id: 1, attribute: "S" },
        { id: 2, attribute: "M" },
    ],
    4: [
        { id: 1, attribute: "S" },
        { id: 2, attribute: "M" },
        { id: 3, attribute: "L" },
        { id: 4, attribute: "XL" },
    ],
    5: [
        { id: 1, attribute: "S" },
        { id: 2, attribute: "M" },
        { id: 3, attribute: "L" },
    ],
    6: [
        { id: 1, attribute: "M" },
        { id: 2, attribute: "L" },
        { id: 3, attribute: "XL" },
    ],
}

export const pVariant = {
    1: [
        { id: 1, attribute: "S", color: "Black", fit: "Regular", price: 100.00, stock: 10 },
        { id: 2, attribute: "M", color: "Black", fit: "Regular", price: 110.00, stock: 10 },
    ],
    2: [
        { id: 1, attribute: "S", color: "Black", fit: "Regular", price: 100.00, stock: 10 },
        { id: 2, attribute: "M", color: "Black", fit: "Regular", price: 110.00, stock: 10 },
    ],
    3: [
        { id: 1, attribute: "S", color: "Black", fit: "Regular", price: 100.00, stock: 10 },
        { id: 2, attribute: "M", color: "Black", fit: "Regular", price: 110.00, stock: 10 },
    ],
    4: [
        { id: 1, attribute: "S", color: "White", fit: "Regular", price: 120.00, stock: 15 },
        { id: 2, attribute: "M", color: "White", fit: "Regular", price: 125.00, stock: 15 },
        { id: 3, attribute: "L", color: "White", fit: "Regular", price: 130.00, stock: 15 },
        { id: 4, attribute: "XL", color: "White", fit: "Regular", price: 135.00, stock: 15 },
    ],
    5: [
        { id: 1, attribute: "S", color: "Blue", fit: "Slim", price: 95.00, stock: 8 },
        { id: 2, attribute: "M", color: "Blue", fit: "Slim", price: 105.00, stock: 8 },
        { id: 3, attribute: "L", color: "Blue", fit: "Slim", price: 115.00, stock: 8 },
    ],
    6: [
        { id: 1, attribute: "M", color: "Red", fit: "Relaxed", price: 150.00, stock: 5 },
        { id: 2, attribute: "L", color: "Red", fit: "Relaxed", price: 155.00, stock: 5 },
        { id: 3, attribute: "XL", color: "Red", fit: "Relaxed", price: 160.00, stock: 5 },
    ],
}