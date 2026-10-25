import React, { createContext, useContext, useState } from 'react';
import { cartVariantKey, clampQuantity, mergeCartVariant, quantityLimit } from './cartLogic';

const CartContext = createContext();

export function CartProvider({ children }) {
  const [cart, setCart] = useState([]);
  
  const addToCart = (newItem) => {
    setCart((currentCart) => {
      const newItemKey = cartVariantKey(newItem);
      const existingIndex = currentCart.findIndex(
        (item) => newItemKey !== null && cartVariantKey(item) === newItemKey
      );

      if (existingIndex > -1) {
        const updatedCart = [...currentCart];
        updatedCart[existingIndex] = mergeCartVariant(updatedCart[existingIndex], newItem);

        return updatedCart;
      }

      const requested = Number(newItem?.quantity);
      const safeRequested = Number.isSafeInteger(requested) && requested >= 1 ? requested : 1;
      const limit = quantityLimit(newItem);
      return [{
        ...newItem,
        quantity: limit > 0 ? Math.min(safeRequested, limit) : 1,
      }, ...currentCart];
    });
  };

  const changeQuantity = (id, amount) => {
    setCart((currentCart) =>
      currentCart.map((item) => {
        if (item.id !== id) {
          return item;
        }

        return {
          ...item,
          quantity: clampQuantity(item, amount),
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
