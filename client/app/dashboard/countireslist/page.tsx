"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pencil, Trash2, Check, X, Globe, Flag, Hash, Phone, Edit3, Search, RefreshCw, Image as ImageIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface Country {
  _id: string;
  name: string;
  code: string;
  dialcode: number;
  flag: string;
  active: boolean;
}

export default function CountriesPageWithTRPC() {
  const trpc = useTRPC();

  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Country>>({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [countryToDelete, setCountryToDelete] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // tRPC query for fetching countries
  const {
    data: countries = [],
    isLoading,
    refetch,
  } = useQuery({
    ...trpc.countries.all.queryOptions(),
    refetchOnWindowFocus: false,
  });

  // Delete mutation
  const deleteMutation = useMutation({
    ...trpc.countries.delete.mutationOptions(),
    onSuccess: () => {
      toast.success("Country deleted successfully");
      refetch();
      setDeleteDialogOpen(false);
      setCountryToDelete(null);
    },
    onError: (error: any) => {
      toast.error(`Failed to delete country: ${error.message}`);
    },
  });

  // Edit mutation
  const editMutation = useMutation({
    ...trpc.countries.edit.mutationOptions(),
    onSuccess: () => {
      toast.success("Country updated successfully");
      refetch();
      setEditId(null);
      setEditData({});
    },
    onError: (error: any) => {
      toast.error(`Failed to update country: ${error.message}`);
    },
  });

  const startEdit = (country: Country) => {
    setEditId(country._id);
    setEditData({
      name: country.name,
      code: country.code,
      dialcode: country.dialcode,
      flag: country.flag,
      active: country.active,
    });
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditData({});
  };

  const handleChange = (field: keyof Country, value: any) => {
    setEditData((prev) => ({ ...prev, [field]: value }));
  };

  const saveEdit = async (id: string) => {
    if (!editData.name || !editData.code || !editData.flag || editData.dialcode === undefined) {
      toast.error("Please fill all required fields");
      return;
    }

    await editMutation.mutateAsync({
      id,
      name: editData.name,
      code: editData.code,
      flag: editData.flag,
      dialcode: editData.dialcode,
      active: editData.active ?? true,
    });
  };

  const openDeleteDialog = (id: string) => {
    setCountryToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!countryToDelete) return;
    await deleteMutation.mutateAsync({ id: countryToDelete });
  };

  // Filter countries
  const filteredCountries = countries.filter((country: any) =>
    country.name.toLowerCase().includes(search.toLowerCase()) ||
    country.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Globe className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8" />
            Countries
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Manage countries and their dial codes
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isLoading} className="w-full sm:w-auto">
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          placeholder="Search countries..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Flag</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Dial Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <div className="animate-pulse text-muted-foreground">Loading countries...</div>
                    </TableCell>
                  </TableRow>
                ) : filteredCountries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <div className="text-muted-foreground">No countries found</div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCountries.map((country: any) => (
                    <TableRow key={country._id}>
                      <TableCell>
                        {editId === country._id ? (
                          <Input
                            value={editData.flag || ""}
                            onChange={(e) => handleChange("flag", e.target.value)}
                            placeholder="Flag URL"
                            className="h-8"
                          />
                        ) : (
                          country.flag ? (
                            <img
                              src={country.flag}
                              alt={country.name}
                              className="w-6 h-4 rounded"
                            />
                          ) : (
                            <Flag className="h-4 w-4 text-muted-foreground" />
                          )
                        )}
                      </TableCell>
                      <TableCell>
                        {editId === country._id ? (
                          <Input
                            value={editData.name || ""}
                            onChange={(e) => handleChange("name", e.target.value)}
                            className="h-8"
                          />
                        ) : (
                          country.name
                        )}
                      </TableCell>
                      <TableCell>
                        {editId === country._id ? (
                          <Input
                            value={editData.code || ""}
                            onChange={(e) => handleChange("code", e.target.value.toUpperCase())}
                            className="h-8 w-20"
                          />
                        ) : (
                          <Badge variant="outline">{country.code}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {editId === country._id ? (
                          <Input
                            type="number"
                            value={editData.dialcode || ""}
                            onChange={(e) => handleChange("dialcode", parseInt(e.target.value) || 0)}
                            className="h-8 w-24"
                          />
                        ) : (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            +{country.dialcode}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editId === country._id ? (
                          <Select
                            value={editData.active ? "true" : "false"}
                            onValueChange={(val) => handleChange("active", val === "true")}
                          >
                            <SelectTrigger className="h-8 w-24">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="true">Active</SelectItem>
                              <SelectItem value="false">Inactive</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant={country.active ? "default" : "secondary"}>
                            {country.active ? "Active" : "Inactive"}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {editId === country._id ? (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={cancelEdit}
                              disabled={editMutation.isPending}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => saveEdit(country._id)}
                              disabled={editMutation.isPending}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => startEdit(country)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDeleteDialog(country._id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the country{" "}
              {countryToDelete && countries.find((c: any) => c._id === countryToDelete)?.name}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
