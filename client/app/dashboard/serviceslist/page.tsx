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
import { Pencil, Trash2, Check, X, Zap, Search, RefreshCw, MessageSquare, Power, PowerOff, Layers, CheckCircle2, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
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

interface Service {
  id: string;
  name: string;
  code: string;
  format: any[];
  image: string;
  multisms: boolean;
  maxmessage: number;
  active: boolean;
}

export default function ServicesPageWithTRPC() {
  const trpc = useTRPC();

  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Service>>({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // tRPC query for fetching services
  const {
    data: services = [],
    isLoading,
    refetch,
  } = useQuery({
    ...trpc.services.all.queryOptions(),
    refetchOnWindowFocus: false,
  });

  // Delete mutation
  const deleteMutation = useMutation({
    ...trpc.services.delete.mutationOptions(),
    onSuccess: () => {
      console.log('[Services] Delete mutation succeeded');
      toast.success("Service deleted successfully");
      refetch();
      setDeleteDialogOpen(false);
      setServiceToDelete(null);
    },
    onError: (error: any) => {
      console.error('[Services] Delete mutation failed:', error);
      toast.error(`Failed to delete service: ${error.message}`);
    },
  });

  // Edit mutation
  const editMutation = useMutation({
    ...trpc.services.edit.mutationOptions(),
    onSuccess: () => {
      console.log('[Services] Edit mutation succeeded');
      toast.success("Service updated successfully");
      refetch();
      setEditId(null);
      setEditData({});
    },
    onError: (error: any) => {
      console.error('[Services] Edit mutation failed:', error);
      toast.error(`Failed to update service: ${error.message}`);
    },
  });

  const startEdit = (service: Service) => {
    console.log('[Services] Starting edit for service:', service.id, service.name);
    setEditId(service.id);
    setEditData(service);
  };

  const cancelEdit = () => {
    console.log('[Services] Canceling edit');
    setEditId(null);
    setEditData({});
  };

  const handleChange = (field: keyof Service, value: any) => {
    console.log('[Services] Changing field:', field, 'to:', value);
    setEditData((prev) => ({ ...prev, [field]: value }));
  };

  const saveEdit = async (id: string) => {
    console.log('[Services] Saving edit for service:', id);
    if (!editData.name || !editData.code || !editData.image) {
      toast.error("Please fill all required fields");
      return;
    }

    await editMutation.mutateAsync({
      id,
      name: editData.name,
      code: editData.code,
      format: editData.format || [],
      image: editData.image,
      multisms: editData.multisms ?? true,
      maxmessage: editData.maxmessage ?? 0,
      active: editData.active ?? true,
    });
  };

  const openDeleteDialog = (id: string) => {
    console.log('[Services] Opening delete dialog for service:', id);
    setServiceToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!serviceToDelete) return;
    await deleteMutation.mutateAsync({ id: serviceToDelete });
  };

  // Filter services
  const filteredServices = services.filter((service: any) =>
    service.name.toLowerCase().includes(search.toLowerCase()) ||
    service.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Zap className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8" />
            Services
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Manage OTP services and their formats
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
          placeholder="Search services..."
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
                  <TableHead>Icon</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Multi-SMS</TableHead>
                  <TableHead>Max Messages</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <div className="animate-pulse text-muted-foreground">Loading services...</div>
                    </TableCell>
                  </TableRow>
                ) : filteredServices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <div className="text-muted-foreground">No services found</div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredServices.map((service: any) => (
                    <TableRow key={service.id}>
                      <TableCell>
                        {service.image ? (
                          <img src={service.image} alt={service.name} className="w-6 h-6 rounded" />
                        ) : (
                          <MessageSquare className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell>
                        {editId === service.id ? (
                          <Input
                            value={editData.name || ""}
                            onChange={(e) => handleChange("name", e.target.value)}
                            className="h-8"
                          />
                        ) : (
                          service.name
                        )}
                      </TableCell>
                      <TableCell>
                        {editId === service.id ? (
                          <Input
                            value={editData.code || ""}
                            onChange={(e) => handleChange("code", e.target.value)}
                            className="h-8"
                            placeholder="Service code"
                          />
                        ) : (
                          <Badge variant="outline">{service.code}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {editId === service.id ? (
                          <Button
                            size="sm"
                            variant={editData.multisms ? "default" : "secondary"}
                            onClick={() => handleChange("multisms", !editData.multisms)}
                            className="h-8 px-2"
                          >
                            {editData.multisms ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : (
                              <XCircle className="h-4 w-4" />
                            )}
                          </Button>
                        ) : (
                          <Badge variant={service.multisms ? "default" : "secondary"}>
                            {service.multisms ? "Yes" : "No"}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {editId === service.id ? (
                          <Input
                            type="number"
                            value={editData.maxmessage ?? 0}
                            onChange={(e) => handleChange("maxmessage", parseInt(e.target.value) || 0)}
                            className="h-8 w-20"
                            min="0"
                          />
                        ) : (
                          service.maxmessage || 0
                        )}
                      </TableCell>
                      <TableCell>
                        {editId === service.id ? (
                          <Button
                            size="sm"
                            variant={editData.active ? "default" : "secondary"}
                            onClick={() => handleChange("active", !editData.active)}
                            className="h-8 px-2"
                          >
                            {editData.active ? (
                              <Power className="h-4 w-4" />
                            ) : (
                              <PowerOff className="h-4 w-4" />
                            )}
                          </Button>
                        ) : (
                          <Badge variant={service.active ? "default" : "secondary"}>
                            {service.active ? "Active" : "Inactive"}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {editId === service.id ? (
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
                              onClick={() => saveEdit(service.id)}
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
                              onClick={() => startEdit(service)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDeleteDialog(service.id)}
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
              {`This action cannot be undone. This will permanently delete the service ${
                serviceToDelete && services.find((s: any) => s.id === serviceToDelete)?.name
              }.`}
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
