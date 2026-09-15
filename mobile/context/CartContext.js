import React, { createContext, useContext, useState } from 'react';

const CartContext = createContext();

const INITIAL_PRODUCTS = [
  {
    id: '1-Lime-Large-Regular',
    productId: 1,
    name: 'METRODRIP OVERSIZED HOODIE',
    size: 'Large',
    color: 'Lime',
    fit: 'Regular',
    price: 1899,
    quantity: 1,
    image: 'https://via.placeholder.com/300x350',
  },
  {
    id: '2-White / Black-Medium-Regular',
    productId: 2,
    name: 'METRODRIP GRAPHIC TEE',
    size: 'Medium',
    color: 'White / Black',
    fit: 'Regular',
    price: 899,
    quantity: 2,
    image: 'https://via.placeholder.com/300x350',
  },
];

export function CartProvider({ children }) {
  const [cart, setCart] = useState([]);
  
  const addToCart = (newItem) => {
    setCart((currentCart) => {
      const existingIndex = currentCart.findIndex(
        (item) => item.id === newItem.id
      );

      if (existingIndex > -1) {
        const updatedCart = [...currentCart];
        const existingItem = updatedCart[existingIndex];

        const newQuantity =
          existingItem.quantity + (newItem.quantity || 1);

        updatedCart[existingIndex] = {
          ...existingItem,
          quantity: Math.min(newQuantity, existingItem.stock),
        };

        return updatedCart;
      }

      return [newItem, ...currentCart];
    });
  };

  const changeQuantity = (id, amount) => {
    setCart((currentCart) =>
      currentCart.map((item) => {
        if (item.id !== id) {
          return item;
        }

        const newQuantity = item.quantity + amount;

        return {
          ...item,
          quantity: Math.max(1, Math.min(newQuantity, item.stock)),
        };
      })
    );
  };

  const removeItem = (id) => {
    setCart((currentCart) => currentCart.filter((item) => item.id !== id));
  };

  const clearCart = () => {
    setCart([]);
  };

  return (
    <CartContext.Provider
      value={{
        cart,
        addToCart,
        changeQuantity,
        removeItem,
        clearCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
